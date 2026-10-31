import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

import type { AppLanguage } from '@/shared/utils/languages';

import { getVoiceInput, type SystemTranscriptionResult } from '../../../../../modules/voice-input';
import { createSystemTranscription } from '../systemTranscription';
import { transcribeAudioChunks } from '../transcribeAudioChunks';

jest.mock('../../../../../modules/voice-input', () => ({ getVoiceInput: jest.fn() }));
jest.mock('../transcribeAudioChunks', () => ({ transcribeAudioChunks: jest.fn() }));
jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    getSpeechRecognizerPermissionsAsync: jest.fn(async () => ({ granted: true })),
    requestSpeechRecognizerPermissionsAsync: jest.fn(),
    getMicrophonePermissionsAsync: jest.fn(),
    requestMicrophonePermissionsAsync: jest.fn(),
  },
}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'recognition-1' }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function setup() {
  let language: AppLanguage = 'zh-CN';
  const native = {
    decodeAudioChunk: jest.fn(),
    systemTranscriptionStatus: jest.fn(
      async (): Promise<'ready' | 'needs-setup' | 'unsupported'> => 'ready',
    ),
    transcribeAudioChunk: jest.fn(
      async (): Promise<SystemTranscriptionResult> => ({ text: 'Recognized speech.' }),
    ),
    cancelTranscription: jest.fn(async () => {}),
  };
  jest
    .mocked(getVoiceInput)
    .mockReturnValue(native as unknown as NonNullable<ReturnType<typeof getVoiceInput>>);
  jest.mocked(transcribeAudioChunks).mockImplementation(async (_uri, recognize) => ({
    text: await recognize('file:///chunk.wav'),
    durationSeconds: 30,
  }));
  const engine = createSystemTranscription({
    language: () => language,
    permissions: {
      runWithSystemPrompt: (operation) => operation(),
      isPresentingSystemPrompt: () => false,
    },
  });
  const controller = new AbortController();
  return {
    native,
    engine,
    controller,
    setLanguage: (next: AppLanguage) => {
      language = next;
    },
    run: () => engine.transcribe('file:///audio.m4a', { signal: controller.signal }),
  };
}
beforeEach(() => {
  jest.clearAllMocks();
});

test('checks the selected recording language and prevents recognition or permission prompts when offline support is missing', async () => {
  const { native, engine, controller, run } = setup();
  native.systemTranscriptionStatus.mockResolvedValue('needs-setup');
  await expect(engine.status(controller.signal)).resolves.toBe('needs-setup');
  await expect(run()).rejects.toMatchObject({ code: 'offline-recognition-unavailable' });
  expect(native.systemTranscriptionStatus).toHaveBeenCalledWith('zh-CN');
  expect(native.transcribeAudioChunk).not.toHaveBeenCalled();
  expect(ExpoSpeechRecognitionModule.getSpeechRecognizerPermissionsAsync).not.toHaveBeenCalled();
});

test('uses a captured language across permission prompts and never requests microphone access on iOS', async () => {
  const { native, setLanguage, run } = setup();
  jest
    .mocked(ExpoSpeechRecognitionModule.getSpeechRecognizerPermissionsAsync)
    .mockImplementationOnce(async () => {
      setLanguage('en-US');
      return { granted: true, canAskAgain: true, expires: 'never', status: 'granted' } as Awaited<
        ReturnType<typeof ExpoSpeechRecognitionModule.getSpeechRecognizerPermissionsAsync>
      >;
    });
  await expect(run()).resolves.toMatchObject({ text: 'Recognized speech.' });
  expect(native.transcribeAudioChunk).toHaveBeenCalledWith(
    'recognition-1',
    'file:///chunk.wav',
    'zh-CN',
  );
  expect(ExpoSpeechRecognitionModule.getMicrophonePermissionsAsync).not.toHaveBeenCalled();
  expect(ExpoSpeechRecognitionModule.requestMicrophonePermissionsAsync).not.toHaveBeenCalled();
});

test('cancellation joins the native result and discards late recognized text', async () => {
  const { native, controller, run } = setup();
  const entered = deferred<void>();
  const result = deferred<SystemTranscriptionResult>();
  native.transcribeAudioChunk.mockImplementation(() => {
    entered.resolve();
    return result.promise;
  });
  let settled = false;
  const work = run();
  void work.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await entered.promise;
  controller.abort();
  await Promise.resolve();
  expect(native.cancelTranscription).toHaveBeenCalledWith('recognition-1');
  expect(settled).toBe(false);
  result.resolve({ text: 'Discard this.' });
  await expect(work).rejects.toBe(controller.signal.reason);
});

test('silence is an empty window but an unsupported native engine fails instead of retrying online', async () => {
  const { native, run } = setup();
  native.transcribeAudioChunk.mockResolvedValueOnce({ error: 'no-speech' });
  await expect(run()).resolves.toMatchObject({ text: '' });
  native.transcribeAudioChunk.mockResolvedValueOnce({ error: 'unsupported' });
  await expect(run()).rejects.toMatchObject({ code: 'unsupported' });
  expect(native.transcribeAudioChunk).toHaveBeenCalledTimes(2);
});

test('an old client without the strict native file recognizer is unavailable', async () => {
  const { native, engine, controller, run } = setup();
  jest
    .mocked(getVoiceInput)
    .mockReturnValue({ decodeAudioChunk: native.decodeAudioChunk } as unknown as NonNullable<
      ReturnType<typeof getVoiceInput>
    >);
  await expect(engine.status(controller.signal)).resolves.toBe('unsupported');
  await expect(run()).rejects.toMatchObject({ code: 'unsupported' });
  expect(native.transcribeAudioChunk).not.toHaveBeenCalled();
});
