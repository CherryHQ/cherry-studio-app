import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useSpeech } from '../useSpeech';
import { useVoiceInput } from '../useVoiceInput';
import { useVoiceRequest } from '../useVoiceRequest';

const mockToast = jest.fn();
const mockConfirm = jest.fn();
const mockDelete = jest.fn();
const mockSave = jest.fn(async () => undefined);
const mockPick = jest.fn();
const mockAudioMode = jest.fn();
const mockVoice = {
  requestMicrophoneAccess: jest.fn(),
  transcribe: jest.fn(),
  generateSpeech: jest.fn(),
  releaseAudio: jest.fn(),
};
const mockSettings = jest.fn();
const mockRecorder = {
  uri: 'file:///cache/record.m4a',
  isRecording: false,
  prepareToRecordAsync: jest.fn(),
  record: jest.fn(),
  stop: jest.fn(),
};
const mockPlayer = { replace: jest.fn(), play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() };
const mockModel = {
  selection: { providerId: 'local-account', modelId: 'audio-model' },
  save: mockSave,
  isValid: true,
};

jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: mockToast } }),
  useAlert: () => ({ alert: { confirm: mockConfirm } }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/frontend/components/AiFailure', () => ({
  aiFailureReasonTitleKey: (code: string) => `failure.${code}`,
}));
jest.mock('@/frontend/data', () => ({
  useBackendModule: (name: string) =>
    name === 'voice' ? mockVoice : { openSystemSettings: mockSettings },
  usePreference: () => ['alloy', mockSave],
}));
jest.mock('@/frontend/hooks/file', () => ({ useFileUploadPicker: () => mockPick }));
jest.mock('../useVoiceModel', () => ({ useVoiceModel: () => mockModel }));
jest.mock('expo-file-system', () => ({
  File: class {
    exists = true;
    uri: string;
    constructor(value: string) {
      this.uri = value;
    }
    delete() {
      mockDelete(this.uri);
    }
  },
}));
jest.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  setAudioModeAsync: (...args: unknown[]) => mockAudioMode(...args),
  useAudioRecorder: () => mockRecorder,
  useAudioRecorderState: () => ({ durationMillis: 1000 }),
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => ({ playing: false }),
}));
jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: { withContext: () => ({ warn: jest.fn() }) },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
let renderer: ReactTestRenderer | undefined;
let input: ReturnType<typeof useVoiceInput>;
let speech: ReturnType<typeof useSpeech>;
let request: ReturnType<typeof useVoiceRequest>;
const onTranscribed = jest.fn();
const onClose = jest.fn();
const listeners = new Set<(state: AppStateStatus) => void>();
function Probe({ mode }: { mode: 'input' | 'speech' | 'request' }) {
  if (mode === 'input') return <InputProbe />;
  if (mode === 'speech') return <SpeechProbe />;
  return <RequestProbe />;
}
function InputProbe() {
  const value = useVoiceInput({ onClose, onTranscribed });
  useEffect(() => {
    input = value;
  }, [value]);
  return null;
}
function SpeechProbe() {
  const value = useSpeech({ text: '你好', onClose });
  useEffect(() => {
    speech = value;
  }, [value]);
  return null;
}
function RequestProbe() {
  const value = useVoiceRequest();
  useEffect(() => {
    request = value;
  }, [value]);
  return null;
}
function mount(mode: 'input' | 'speech' | 'request') {
  act(() => {
    renderer = create(<Probe mode={mode} />);
  });
}
async function flush(action: () => void = () => undefined) {
  await act(async () => {
    action();
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}
function background() {
  for (const listener of listeners) listener('background');
}

beforeEach(() => {
  jest.clearAllMocks();
  listeners.clear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    listeners.add(listener);
    return { remove: () => listeners.delete(listener) };
  });
  mockAudioMode.mockReset().mockResolvedValue(undefined);
  mockVoice.requestMicrophoneAccess
    .mockReset()
    .mockResolvedValue({ granted: true, canAskAgain: true });
  mockVoice.releaseAudio.mockReset().mockResolvedValue(undefined);
  mockVoice.transcribe.mockReset().mockResolvedValue('你好');
  mockVoice.generateSpeech
    .mockReset()
    .mockResolvedValue({ id: 'output', uri: 'file:///cache/output.wav' });
  mockPick.mockReset().mockResolvedValue([{ uri: 'file:///cache/import.m4a', name: 'import.m4a' }]);
  mockRecorder.isRecording = false;
  mockRecorder.prepareToRecordAsync.mockReset().mockResolvedValue(undefined);
  mockRecorder.stop.mockReset().mockImplementation(async () => {
    mockRecorder.isRecording = false;
  });
  mockRecorder.record.mockReset().mockImplementation(() => {
    mockRecorder.isRecording = true;
  });
  mockPlayer.seekTo.mockReset().mockResolvedValue(undefined);
});
afterEach(async () => {
  await flush(() => renderer?.unmount());
  renderer = undefined;
  jest.restoreAllMocks();
});

test('cancellation rejects a late result and blocks a second operation until cleanup settles', async () => {
  mount('request');
  const late = deferred<string>();
  const discard = jest.fn();
  const accept = jest.fn();
  const second = jest.fn();
  await flush(() => {
    void request.run(() => late.promise, accept, discard);
    request.cancel();
    void request.run(second, accept);
  });
  expect(request.isRunning).toBe(true);
  expect(second).not.toHaveBeenCalled();
  await flush(() => late.resolve('late'));
  expect(accept).not.toHaveBeenCalled();
  expect(discard).toHaveBeenCalledWith('late');
  expect(request.isRunning).toBe(false);
});

test('transcription uses the selected local account and inserts reviewable text only after completion', async () => {
  mount('input');
  await flush(() => input.chooseFile());
  expect(onTranscribed).not.toHaveBeenCalled();
  await flush(() => input.transcribe());
  expect(mockVoice.transcribe).toHaveBeenCalledWith(
    { ...mockModel.selection, uri: 'file:///cache/import.m4a' },
    { signal: expect.any(AbortSignal) },
  );
  expect(onTranscribed).toHaveBeenCalledWith('你好');
  expect(onClose).toHaveBeenCalledTimes(1);
});

test.each(['close', 'background', 'unmount'] as const)(
  '%s aborts transcription, keeps upload bytes until settlement, and never inserts late text',
  async (event) => {
    mount('input');
    await flush(() => input.chooseFile());
    const late = deferred<string>();
    mockVoice.transcribe.mockReturnValueOnce(late.promise);
    await flush(() => input.transcribe());
    const signal = mockVoice.transcribe.mock.calls[0][1].signal as AbortSignal;
    await flush(() => {
      if (event === 'background') background();
      else if (event === 'close') {
        input.close();
        renderer?.unmount();
      } else renderer?.unmount();
    });
    expect(signal.aborted).toBe(true);
    expect(mockDelete).not.toHaveBeenCalledWith('file:///cache/import.m4a');
    await flush(() => late.resolve('stale'));
    expect(onTranscribed).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith('file:///cache/import.m4a');
  },
);

test('a cancelled file picker deletes only its late cache copy', async () => {
  mount('input');
  const late = deferred<{ uri: string; name: string }[]>();
  mockPick.mockReturnValueOnce(late.promise);
  await flush(() => input.chooseFile());
  await flush(() => input.close());
  await flush(() => late.resolve([{ uri: 'file:///cache/late.m4a', name: 'late' }]));
  expect(input.input).toBeNull();
  expect(mockDelete).toHaveBeenCalledWith('file:///cache/late.m4a');
});

test.each([true, false])(
  'denied microphone permission (canAskAgain=%s) never prepares the recorder',
  async (canAskAgain) => {
    mockVoice.requestMicrophoneAccess.mockResolvedValueOnce({ granted: false, canAskAgain });
    mount('input');
    await flush(() => input.startRecording());
    expect(mockRecorder.prepareToRecordAsync).not.toHaveBeenCalled();
    expect(mockRecorder.record).not.toHaveBeenCalled();
    if (canAskAgain)
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'voice.permissionDenied' }),
      );
    else {
      expect(mockSettings).not.toHaveBeenCalled();
      expect(mockConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ confirmLabel: 'settings.permissions.openSystemSettings' }),
      );
    }
  },
);

test('records for at most two minutes and cleans its native file when closed', async () => {
  mount('input');
  await flush(() => input.startRecording());
  expect(mockRecorder.record).toHaveBeenCalledWith({ forDuration: 120 });
  expect(input.isRecording).toBe(true);
  await flush(() => input.stopRecording());
  expect(input.input?.uri).toBe('file:///cache/record.m4a');
  expect(mockVoice.transcribe).not.toHaveBeenCalled();
  await flush(() => renderer?.unmount());
  expect(mockDelete).toHaveBeenCalledWith('file:///cache/record.m4a');
});

test('a recorder prepared after unmount is stopped and its file is deleted without starting', async () => {
  const prepared = deferred<void>();
  mockRecorder.prepareToRecordAsync.mockReturnValueOnce(prepared.promise);
  mount('input');
  await flush(() => input.startRecording());
  expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
  await flush(() => renderer?.unmount());
  await flush(() => prepared.resolve());
  expect(mockRecorder.record).not.toHaveBeenCalled();
  expect(mockDelete).toHaveBeenCalledWith('file:///cache/record.m4a');
});

test('playback detaches before releasing the WAV file and close releases it once', async () => {
  mount('speech');
  await flush(() => speech.generate());
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  await flush(() => speech.close());
  await flush(() => renderer?.unmount());
  expect(mockVoice.releaseAudio).toHaveBeenCalledTimes(1);
  expect(mockPlayer.replace.mock.calls.at(-1)).toEqual([null]);
  expect(mockPlayer.replace.mock.invocationCallOrder.at(-1)!).toBeGreaterThan(
    mockVoice.releaseAudio.mock.invocationCallOrder[0],
  );
  const detachCalls = mockPlayer.replace.mock.calls.flatMap((args, i) =>
    args[0] === null ? [mockPlayer.replace.mock.invocationCallOrder[i]] : [],
  );
  expect(
    detachCalls.some((order) => order < mockVoice.releaseAudio.mock.invocationCallOrder[0]),
  ).toBe(true);
});

test.each(['close', 'background'] as const)(
  '%s releases late generated audio without playback',
  async (event) => {
    const late = deferred<{ id: string; uri: string }>();
    mockVoice.generateSpeech.mockReturnValueOnce(late.promise);
    mount('speech');
    await flush(() => speech.generate());
    await flush(() => (event === 'close' ? speech.close() : background()));
    await flush(() => late.resolve({ id: 'late', uri: 'file:///cache/late.wav' }));
    expect(mockPlayer.play).not.toHaveBeenCalled();
    expect(mockVoice.releaseAudio).toHaveBeenCalledWith('late');
  },
);

test('cancellation during audio-mode setup cannot start late playback', async () => {
  const mode = deferred<void>();
  mockAudioMode.mockReturnValueOnce(mode.promise);
  mount('speech');
  await flush(() => speech.generate());
  await flush(() => speech.close());
  await flush(() => mode.resolve());
  expect(mockPlayer.play).not.toHaveBeenCalled();
  expect(mockVoice.releaseAudio).toHaveBeenCalledWith('output');
});
