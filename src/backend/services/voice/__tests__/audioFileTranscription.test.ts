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
  const transcribe = jest.fn(
    async (): Promise<TranscriptionResult> => ({
      text: 'hello world',
      segments: [
        { text: ' hello', startSecond: 0, endSecond: 1 },
        { text: 'world ', startSecond: 3725.4, endSecond: 3726 },
      ],
      language: 'english',
      durationInSeconds: 3726,
    }),
  );
  const transcriber = createAiTranscriber({
    ai: { transcribe },
    preference: { get: async () => selection },
  });
  const readBytes = jest.fn(async () => new Uint8Array([1, 2, 3]));
  const cache = {
    read: async (key: string) => entries.get(key),
    write: async (key: string, text: string) => void entries.set(key, text),
  };
  return {
    transcribe,
    readBytes,
    run: (fact = file) =>
      createAudioFileTranscriber(transcriber, cache)(fact, readBytes, new AbortController().signal),
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

test('transcribes a revision once per model and reuses the cached transcript', async () => {
  const { run, transcribe, readBytes } = setup();
  const first = await run();
  await expect(run()).resolves.toBe(first);
  expect(transcribe).toHaveBeenCalledTimes(1);
  expect(transcribe).toHaveBeenCalledWith(
    { ...model, audio: new Uint8Array([1, 2, 3]) },
    expect.any(AbortSignal),
  );
  // A new revision of the file is transcribed again.
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
  await expect(silent.run()).rejects.toMatchObject({ issue: { code: 'document-empty' } });
});
