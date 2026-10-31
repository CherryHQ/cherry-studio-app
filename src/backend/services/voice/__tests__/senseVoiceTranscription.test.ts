import { getVoiceInput } from '../../../../../modules/voice-input';
import { openSenseVoiceRecognizer } from '../senseVoiceRecognition';
import { createSenseVoiceTranscription } from '../senseVoiceTranscription';
import type { VoiceModel } from '../voiceModel';

const mockFiles = new Set<string>();
jest.mock('expo-file-system', () => ({
  File: class {
    constructor(readonly uri: string) {}
    get exists() {
      return mockFiles.has(this.uri);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  },
}));
jest.mock('../../../../../modules/voice-input', () => ({ getVoiceInput: jest.fn() }));
jest.mock('../senseVoiceRecognition', () => ({
  getSenseVoiceStatus: jest.fn(async () => 'ready'),
  openSenseVoiceRecognizer: jest.fn(),
}));
const model = {} as VoiceModel;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(totalSeconds = 65) {
  const decodeAudioChunk = jest.fn(async (_uri: string, start: number, duration: number) => {
    const uri = `file:///chunk-${start}.wav`;
    mockFiles.add(uri);
    return { uri, totalSeconds, endSeconds: Math.min(totalSeconds, start + duration) };
  });
  jest
    .mocked(getVoiceInput)
    .mockReturnValue({ decodeAudioChunk } as unknown as ReturnType<typeof getVoiceInput>);
  const recognize = jest.fn(async () => 'Speech.');
  const release = jest.fn(async () => {});
  jest.mocked(openSenseVoiceRecognizer).mockResolvedValue({ recognize, release });
  const controller = new AbortController();
  const onProgress = jest.fn();
  const run = () =>
    createSenseVoiceTranscription(model).transcribe('file:///recording.m4a', {
      signal: controller.signal,
      onProgress,
    });
  return { decodeAudioChunk, recognize, release, controller, onProgress, run };
}
beforeEach(() => {
  jest.clearAllMocks();
  mockFiles.clear();
});

test('processes bounded sequential windows, retains all speech, and removes every temporary WAV', async () => {
  const { recognize, decodeAudioChunk, onProgress, release, run } = setup();
  recognize
    .mockResolvedValueOnce('First.')
    .mockResolvedValueOnce('')
    .mockResolvedValueOnce('Last.');
  await expect(run()).resolves.toEqual({ text: 'First.\n\nLast.', durationSeconds: 65 });
  expect(decodeAudioChunk.mock.calls.map((call) => call.slice(1))).toEqual([
    [0, 30],
    [30, 30],
    [60, 30],
  ]);
  expect(onProgress).toHaveBeenLastCalledWith({ completedSeconds: 65, totalSeconds: 65 });
  expect(mockFiles.size).toBe(0);
  expect(release).toHaveBeenCalledTimes(1);
});

test('waits for in-flight inference before releasing the model after cancellation', async () => {
  const { recognize, decodeAudioChunk, controller, release, run } = setup();
  const entered = deferred<void>();
  const inference = deferred<string>();
  recognize.mockImplementation(async () => {
    entered.resolve();
    return inference.promise;
  });
  const work = run();
  await entered.promise;
  controller.abort();
  expect(release).not.toHaveBeenCalled();
  expect(mockFiles.size).toBe(1);
  inference.resolve('discarded');
  await expect(work).rejects.toBe(controller.signal.reason);
  expect(decodeAudioChunk).toHaveBeenCalledTimes(1);
  expect(mockFiles.size).toBe(0);
  expect(release).toHaveBeenCalledTimes(1);
});

test('rejects overlong audio before inference and cleans the decoded window', async () => {
  const { recognize, release, run } = setup(7201);
  await expect(run()).rejects.toMatchObject({ code: 'audio-too-long' });
  expect(recognize).not.toHaveBeenCalled();
  expect(mockFiles.size).toBe(0);
  expect(release).toHaveBeenCalledTimes(1);
});

test('reports silence without creating an empty transcript', async () => {
  const { recognize, run } = setup(20);
  recognize.mockResolvedValue('');
  await expect(run()).rejects.toMatchObject({ code: 'no-speech' });
  expect(mockFiles.size).toBe(0);
});

test('old native clients report unsupported rather than falling back to cloud transcription', async () => {
  jest.mocked(getVoiceInput).mockReturnValue({} as ReturnType<typeof getVoiceInput>);
  const transcription = createSenseVoiceTranscription(model);
  await expect(transcription.status(new AbortController().signal)).resolves.toBe('unsupported');
  await expect(
    transcription.transcribe('file:///audio.wav', { signal: new AbortController().signal }),
  ).rejects.toMatchObject({ code: 'unsupported' });
  expect(openSenseVoiceRecognizer).not.toHaveBeenCalled();
});
