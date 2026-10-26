import type { FileAttachmentFact } from '@/shared/contracts/fileAttachment';
import type { VoiceModelSelection } from '@/shared/contracts/voice';

import { createAiTranscriber, type TranscriptionResult } from '../aiTranscription';
import { createAudioFileTranscriber, formatTranscript } from '../audioFileTranscription';

const file: FileAttachmentFact = {
  fileEntryId: '00000000-0000-7000-8000-000000000001',
  mediaType: 'audio/mp4',
  name: 'meeting.m4a',
  revision: 1,
  size: 3,
};
const model: VoiceModelSelection = { providerId: 'openai', modelId: 'whisper-1' };

function setup(selection: VoiceModelSelection | null = model) {
  const entries = new Map<string, string>();
  const key = (fact: FileAttachmentFact) => `${fact.fileEntryId}/${fact.revision}`;
  const transcribe = jest.fn(
    async (_input?: unknown, _signal?: AbortSignal): Promise<TranscriptionResult> => ({
      text: 'hello world',
      segments: [
        { text: ' hello', startSecond: 0, endSecond: 1 },
        { text: 'world ', startSecond: 3725.4, endSecond: 3726 },
      ],
      language: 'english',
      durationInSeconds: 3726,
    }),
  );
  const readBytes = jest.fn(async () => new Uint8Array([1, 2, 3]));
  const preference = { get: jest.fn(async () => selection) };
  const transcriber = createAiTranscriber({
    ai: { transcribe, getVoiceModelStatus: async () => 'ready' },
    preference,
  });
  const cache = {
    read: async (fact: FileAttachmentFact) => entries.get(key(fact)),
    write: async (fact: FileAttachmentFact, text: string) => void entries.set(key(fact), text),
  };
  const transcribeFile = createAudioFileTranscriber(transcriber, cache);
  return {
    preference,
    transcribe,
    readBytes,
    run: (fact = file, signal = new AbortController().signal) =>
      transcribeFile(fact, readBytes, signal),
  };
}

test('formats timed segments under a transcript header for the model', () => {
  expect(
    formatTranscript({
      text: 'unused',
      segments: [
        { text: ' hello', startSecond: 0, endSecond: 1 },
        { text: 'world', startSecond: 3725.4, endSecond: 3726 },
      ],
      language: 'english',
      durationInSeconds: 3726,
    }),
  ).toBe(
    '[Audio transcript; language: english; duration: 1:02:06]\n[00:00] hello\n[1:02:05] world',
  );
  expect(formatTranscript({ text: ' plain ', segments: [] })).toBe('[Audio transcript]\nplain');
  expect(formatTranscript({ text: ' ', segments: [] })).toBe('');
});

test('transcribes a revision once and reuses the transcript across model changes', async () => {
  const { run, transcribe, readBytes, preference } = setup();
  const first = await run();
  preference.get.mockResolvedValue({ providerId: 'other', modelId: 'whisper-2' });
  await expect(run()).resolves.toBe(first);
  // A cached transcript needs no configured model.
  preference.get.mockResolvedValue(null);
  await expect(run()).resolves.toBe(first);
  expect(transcribe).toHaveBeenCalledTimes(1);
  expect(transcribe).toHaveBeenCalledWith(
    { ...model, audio: new Uint8Array([1, 2, 3]), mediaType: 'audio/mp4' },
    expect.any(AbortSignal),
  );
  // A new revision of the file is transcribed again.
  preference.get.mockResolvedValue(model);
  await run({ ...file, revision: 2 });
  expect(transcribe).toHaveBeenCalledTimes(2);
  expect(readBytes).toHaveBeenCalledTimes(2);
});

test('reports a missing model or a failed request as attachment issues', async () => {
  const unconfigured = setup(null);
  await expect(unconfigured.run()).rejects.toMatchObject({
    issue: { code: 'transcription-unconfigured', name: 'meeting.m4a' },
  });
  expect(unconfigured.readBytes).not.toHaveBeenCalled();
  // A selection without a model ID is not a configured model.
  await expect(setup({ ...model, modelId: ' ' }).run()).rejects.toMatchObject({
    issue: { code: 'transcription-unconfigured' },
  });

  const failing = setup();
  const failure = new Error('401 from the provider');
  failing.transcribe.mockRejectedValueOnce(failure);
  await expect(failing.run()).rejects.toMatchObject({
    issue: { code: 'transcription-failed' },
    cause: failure,
  });

  const silent = setup();
  silent.transcribe.mockResolvedValueOnce({ text: '', segments: [] });
  await expect(silent.run()).rejects.toMatchObject({ issue: { code: 'transcription-empty' } });
});

test('parallel readers of one revision share a single request', async () => {
  const { run, transcribe } = setup();
  const [a, b] = await Promise.all([run(), run()]);
  expect(a).toBe(b);
  expect(transcribe).toHaveBeenCalledTimes(1);
});

test('a shared request is cancelled only after every waiting reader cancels', async () => {
  const { run, transcribe } = setup();
  let request: AbortSignal | undefined;
  let answer!: (result: TranscriptionResult) => void;
  transcribe.mockImplementation(
    (_input, signal) =>
      new Promise<TranscriptionResult>((resolve) => {
        request = signal;
        answer = resolve;
      }),
  );
  const first = new AbortController();
  const second = new AbortController();
  const firstRead = run(file, first.signal);
  const secondRead = run(file, second.signal);
  await new Promise<void>((resolve) => setImmediate(resolve));
  first.abort(new Error('first answer failed'));
  await expect(firstRead).rejects.toThrow('first answer failed');
  expect(request?.aborted).toBe(false);
  answer({ text: 'kept', segments: [] });
  await expect(secondRead).resolves.toBe('[Audio transcript]\nkept');

  const third = new AbortController();
  const thirdRead = run({ ...file, revision: 3 }, third.signal);
  await new Promise<void>((resolve) => setImmediate(resolve));
  third.abort(new Error('stopped'));
  await expect(thirdRead).rejects.toThrow('stopped');
  expect(request?.aborted).toBe(true);
});
