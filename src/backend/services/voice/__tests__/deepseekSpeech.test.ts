import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { createDeepseekSpeech } from '../deepseekSpeech';

const mockRequest = jest.fn();
const mockPlayer = {
  addListener: jest.fn(),
  play: jest.fn(),
  pause: jest.fn(),
  release: jest.fn(),
};
const mockCreatePlayer = jest.fn(() => mockPlayer);
const mockWrite = jest.fn();
const mockDelete = jest.fn();
const mockReleaseSession = jest.fn(async () => {});

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-audio', () => ({ createAudioPlayer: () => mockCreatePlayer() }));
jest.mock('expo-file-system', () => ({
  File: jest.fn(() => ({
    uri: 'file:///cache/speech.wav',
    exists: true,
    writeSync: mockWrite,
    delete: mockDelete,
  })),
  Paths: { cache: 'file:///cache' },
}));
jest.mock('@/backend/services/http', () => ({
  createHttpClient: () => ({ request: mockRequest }),
}));
jest.mock('@/backend/services/providers/deepseekConnection', () => ({
  resolveDeepseekConnection: async () => ({ baseUrl: 'https://example.test', headers: {} }),
}));
jest.mock('../audioSession', () => ({
  voiceAudioSession: {
    acquire: async () => mockReleaseSession,
    playback: async () => {},
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockRequest.mockReset();
  mockPlayer.addListener.mockReset().mockReturnValue({ remove: jest.fn() });
  mockPlayer.play.mockReset();
  mockPlayer.pause.mockReset();
  mockPlayer.release.mockReset();
  mockDelete.mockReset();
  mockReleaseSession.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test.each([
  { platform: 'ios', expected: ['remove listener', 'release', 'abort returned'] },
  { platform: 'android', expected: ['pause', 'abort returned', 'remove listener', 'release'] },
] as const)(
  'stops $platform playback in the abort callback and releases once',
  async ({ platform, expected }) => {
    jest.replaceProperty(Platform, 'OS', platform);
    const controller = new AbortController();
    const reason = new Error('Stopped reading');
    const events: string[] = [];
    mockRequest.mockResolvedValueOnce(wav());
    mockPlayer.addListener.mockReturnValueOnce({ remove: () => events.push('remove listener') });
    mockPlayer.play.mockImplementationOnce(() => {
      queueMicrotask(() => {
        controller.abort(reason);
        events.push('abort returned');
      });
    });
    mockPlayer.pause.mockImplementation(() => events.push('pause'));
    mockPlayer.release.mockImplementation(() => events.push('release'));

    const speech = createDeepseekSpeech(async () => 'stella');
    await expect(
      speech.speak({ text: 'Hello.', language: 'en-US', signal: controller.signal }),
    ).rejects.toBe(reason);
    expect(events).toEqual(expected);
  },
);

test('overlaps playback with only one validated WAV in memory and reports the first native start', async () => {
  const first = deferred<ReturnType<typeof wav>>();
  const second = deferred<ReturnType<typeof wav>>();
  const third = deferred<ReturnType<typeof wav>>();
  const firstRequested = deferred<void>();
  mockRequest
    .mockImplementationOnce(() => {
      firstRequested.resolve();
      return first.promise;
    })
    .mockReturnValueOnce(second.promise)
    .mockReturnValueOnce(third.promise);
  const [firstPlay, secondPlay, thirdPlay] = playbackGates(3);
  const onPlaybackStart = jest.fn();
  const speaking = createDeepseekSpeech(async () => 'stella').speak({
    text: 'a'.repeat(140) + 'b'.repeat(400) + 'c',
    language: 'en-US',
    signal: new AbortController().signal,
    onPlaybackStart,
  });

  await firstRequested.promise;
  expect(mockRequest).toHaveBeenCalledTimes(1);
  expect(File).not.toHaveBeenCalled();
  first.resolve(wav());
  await firstPlay.promise;
  expect(mockRequest.mock.calls.map(([request]) => request.body.text.length)).toEqual([140, 400]);
  expect(File).toHaveBeenCalledTimes(1);
  expect(mockCreatePlayer).toHaveBeenCalledTimes(1);
  expect(onPlaybackStart).not.toHaveBeenCalled();
  updatePlayback({ playing: false });
  updatePlayback({ playing: true });
  updatePlayback({ playing: true });
  expect(onPlaybackStart).toHaveBeenCalledTimes(1);

  second.resolve(wav());
  await Promise.resolve();
  expect(mockRequest).toHaveBeenCalledTimes(2);
  expect(mockWrite).toHaveBeenCalledTimes(1);
  updatePlayback({ didJustFinish: true });

  await secondPlay.promise;
  expect(mockPlayer.release).toHaveBeenCalledTimes(1);
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(mockRequest.mock.calls.map(([request]) => request.body.text.length)).toEqual([
    140, 400, 1,
  ]);
  expect(File).toHaveBeenCalledTimes(2);
  updatePlayback({ playing: true });
  updatePlayback({ didJustFinish: true });
  await Promise.resolve();
  expect(File).toHaveBeenCalledTimes(2);

  third.resolve(wav());
  await thirdPlay.promise;
  updatePlayback({ playing: true });
  updatePlayback({ didJustFinish: true });
  await speaking;
  expect(onPlaybackStart).toHaveBeenCalledTimes(1);
  expect(mockDelete).toHaveBeenCalledTimes(3);
  expect(mockReleaseSession).toHaveBeenCalledTimes(1);
});

test('reports playback once when the first chunk finishes without a native start', async () => {
  mockRequest.mockResolvedValue(wav());
  const [firstPlay, secondPlay, thirdPlay] = playbackGates(3);
  const onPlaybackStart = jest.fn();
  const speaking = createDeepseekSpeech(async () => 'stella').speak({
    text: 'a'.repeat(541),
    language: 'en-US',
    signal: new AbortController().signal,
    onPlaybackStart,
  });

  await firstPlay.promise;
  updatePlayback({ didJustFinish: true });

  await secondPlay.promise;
  const callsBeforeSecondStart = onPlaybackStart.mock.calls.length;
  updatePlayback({ playing: true });
  updatePlayback({ didJustFinish: true });

  await thirdPlay.promise;
  const callsBeforeThirdStart = onPlaybackStart.mock.calls.length;
  updatePlayback({ playing: true });
  updatePlayback({ didJustFinish: true });

  await speaking;
  expect(callsBeforeSecondStart).toBe(1);
  expect(callsBeforeThirdStart).toBe(1);
  expect(onPlaybackStart).toHaveBeenCalledTimes(1);
});

test('a failed prefetch is reported after current playback finishes, without writing the bad WAV', async () => {
  mockRequest.mockResolvedValueOnce(wav()).mockResolvedValueOnce({
    ...wav(),
    data: new ArrayBuffer(44),
  });
  const [started] = playbackGates(1);
  const speaking = createDeepseekSpeech(async () => 'tide').speak({
    text: 'a'.repeat(141),
    language: 'en-US',
    signal: new AbortController().signal,
  });
  const result = jest.fn();
  void speaking.catch(result);

  await started.promise;
  await Promise.resolve();
  expect(result).not.toHaveBeenCalled();
  expect(mockReleaseSession).not.toHaveBeenCalled();
  updatePlayback({ didJustFinish: true });
  await expect(speaking).rejects.toThrow('DeepSeek returned invalid speech audio.');
  expect(mockPlayer.release).toHaveBeenCalledTimes(1);
  expect(mockWrite).toHaveBeenCalledTimes(1);
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(mockReleaseSession).toHaveBeenCalledTimes(1);
});

test('cancels and joins prefetch after Android player and file cleanup, then releases the session', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const controller = new AbortController();
  const prefetched = deferred<ReturnType<typeof wav>>();
  const prefetchAborted = deferred<void>();
  const events: string[] = [];
  mockRequest.mockResolvedValueOnce(wav()).mockImplementationOnce(({ signal }) => {
    signal.addEventListener('abort', () => {
      events.push('abort prefetch');
      prefetchAborted.resolve();
    });
    return prefetched.promise;
  });
  mockPlayer.pause.mockImplementation(() => events.push('pause'));
  mockPlayer.release.mockImplementation(() => events.push('release player'));
  mockDelete.mockImplementation(() => events.push('delete WAV'));
  mockReleaseSession.mockImplementation(async () => {
    events.push('release session');
  });
  const [started] = playbackGates(1);
  const speaking = createDeepseekSpeech(async () => 'stella').speak({
    text: 'a'.repeat(141),
    language: 'en-US',
    signal: controller.signal,
  });
  const outcome = expect(speaking).rejects.toBeDefined();
  await started.promise;
  controller.abort();
  await prefetchAborted.promise;
  expect(events).toEqual(['pause', 'release player', 'delete WAV', 'abort prefetch']);

  prefetched.resolve(wav());
  await outcome;
  expect(events.at(-1)).toBe('release session');
  expect(File).toHaveBeenCalledTimes(1);
  expect(mockCreatePlayer).toHaveBeenCalledTimes(1);
});

function wav() {
  return {
    data: new TextEncoder().encode('RIFF    WAVE'.padEnd(44)).buffer,
    headers: { 'content-type': 'audio/wav' },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function playbackGates(count: number) {
  return Array.from({ length: count }, () => {
    const gate = deferred<void>();
    mockPlayer.play.mockImplementationOnce(gate.resolve);
    return gate;
  });
}

function updatePlayback(status: { playing?: boolean; didJustFinish?: boolean }) {
  mockPlayer.addListener.mock.lastCall![1](status);
}
