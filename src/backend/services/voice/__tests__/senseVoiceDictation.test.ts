import { ASR } from '@siteed/sherpa-onnx.rn';
import { TurboModuleRegistry } from 'react-native';

import { getVoiceInput, type VoiceRecordingResult } from '../../../../../modules/voice-input';
import { createSenseVoiceDictationEngine } from '../senseVoiceDictation';
import type { VoiceModel } from '../voiceModel';

jest.mock('@siteed/sherpa-onnx.rn', () => ({
  ASR: { initialize: jest.fn(), recognizeFromFile: jest.fn(), release: jest.fn() },
}));
jest.mock('expo-audio', () => ({
  getRecordingPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestRecordingPermissionsAsync: jest.fn(),
}));
const mockFiles = new Set<string>();
jest.mock('expo-file-system', () => ({
  File: class {
    constructor(readonly uri: string) {}
    get exists() {
      return mockFiles.has(this.uri);
    }
    delete() {
      if (!mockFiles.delete(this.uri)) throw new Error('File does not exist');
    }
  },
}));
jest.mock('../../../../../modules/voice-input', () => ({ getVoiceInput: jest.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const uri = 'file:///tmp/VoiceInput/voice.wav';
const release = jest.fn();
const native = {
  start: jest.fn(async (_id: string) => {}),
  stop: jest.fn(async (_id: string) => {}),
  cancel: jest.fn(async (_id: string) => {}),
  addListener: jest.fn(),
};
const handlers = new Map<string, (event: VoiceRecordingResult) => void>();
const queue = {
  runWithSystemPrompt: <T>(operation: () => Promise<T>) => operation(),
  isPresentingSystemPrompt: () => false,
};
const model = {
  isReady: jest.fn(async () => true),
  acquire: jest.fn(async () => ({ directory: 'file:///models/Voice%20Model/', release })),
} as unknown as VoiceModel;

beforeEach(() => {
  jest.clearAllMocks();
  handlers.clear();
  mockFiles.clear();
  jest.spyOn(TurboModuleRegistry, 'get').mockReturnValue({});
  jest.mocked(getVoiceInput).mockReturnValue(native as unknown as ReturnType<typeof getVoiceInput>);
  native.addListener.mockImplementation((name, handler) => {
    handlers.set(name, handler);
    return { remove: () => handlers.delete(name) };
  });
  jest.mocked(ASR.initialize).mockResolvedValue({ success: true });
  jest
    .mocked(ASR.recognizeFromFile)
    .mockResolvedValue({ success: true, text: '<|zh|><|NEUTRAL|>你好。' });
  jest.mocked(ASR.release).mockResolvedValue({ released: true });
});

afterEach(() => jest.restoreAllMocks());

async function start() {
  const controller = new AbortController();
  const onText = jest.fn();
  const onTranscribing = jest.fn();
  const session = await createSenseVoiceDictationEngine(model, queue).start({
    signal: controller.signal,
    language: 'zh-CN',
    onText,
    onLevel: jest.fn(),
    onTranscribing,
  });
  return { session, controller, onText, onTranscribing, id: native.start.mock.calls[0][0] };
}

test('publishes only final text, ignores stale recording events and removes temporary audio', async () => {
  const { session, onText, onTranscribing, id } = await start();
  handlers.get('finished')?.({ id: 'old-session', uri });
  await flush();
  expect(ASR.recognizeFromFile).not.toHaveBeenCalled();
  expect(onText).not.toHaveBeenCalled();
  mockFiles.add(uri);
  handlers.get('finished')?.({ id, uri });
  await expect(session.result).resolves.toBe('你好。');
  expect(onTranscribing).toHaveBeenCalledTimes(1);
  expect(onText).toHaveBeenCalledWith('你好。');
  expect(ASR.recognizeFromFile).toHaveBeenCalledWith('/tmp/VoiceInput/voice.wav');
  expect(mockFiles.has(uri)).toBe(false);
  expect(handlers.size).toBe(0);
  expect(release).toHaveBeenCalledTimes(1);
});

test('cancellation joins in-flight native inference before releasing the model and discards its text', async () => {
  const decode = deferred<{ success: boolean; text: string }>();
  jest.mocked(ASR.recognizeFromFile).mockReturnValue(decode.promise);
  const { session, controller, onText, id } = await start();
  mockFiles.add(uri);
  handlers.get('finished')?.({ id, uri });
  await flush();
  controller.abort();
  const rejected = expect(session.result).rejects.toMatchObject({ name: 'AbortError' });
  await flush();
  expect(ASR.release).not.toHaveBeenCalled();
  expect(release).not.toHaveBeenCalled();
  expect(mockFiles.has(uri)).toBe(true);
  decode.resolve({ success: true, text: 'Discard this result' });
  await rejected;
  expect(onText).not.toHaveBeenCalled();
  expect(ASR.release).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledTimes(1);
  expect(mockFiles.has(uri)).toBe(false);
});

test.each([
  { success: false, text: '', code: 'failed' },
  { success: true, text: '', code: 'no-speech' },
])('deletes temporary audio when recognition ends with $code', async ({ code, ...result }) => {
  jest.mocked(ASR.recognizeFromFile).mockResolvedValue(result);
  const { session, onText, id } = await start();
  mockFiles.add(uri);
  handlers.get('finished')?.({ id, uri });
  await expect(session.result).rejects.toMatchObject({ code });
  expect(mockFiles.has(uri)).toBe(false);
  expect(onText).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledTimes(1);
});

test('cancellation while recording settles without requiring a native completion event', async () => {
  const { session, controller, onText, id } = await start();
  controller.abort();
  await expect(session.result).rejects.toMatchObject({ name: 'AbortError' });
  expect(native.cancel).toHaveBeenCalledWith(id);
  expect(ASR.recognizeFromFile).not.toHaveBeenCalled();
  expect(onText).not.toHaveBeenCalled();
  expect(handlers.size).toBe(0);
  expect(release).toHaveBeenCalledTimes(1);
});

test('recognizer initialization failure releases its model and never starts the microphone', async () => {
  jest.mocked(ASR.initialize).mockResolvedValue({ success: false });
  await expect(start()).rejects.toMatchObject({ code: 'failed' });
  expect(native.start).not.toHaveBeenCalled();
  expect(handlers.size).toBe(0);
  expect(release).toHaveBeenCalledTimes(1);
});
