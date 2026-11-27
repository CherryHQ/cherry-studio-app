import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { createDeepseekSpeech } from '../deepseekSpeech';
import type { SpeechPlaybackControls } from '../engines';

const mockRequest = jest.fn();
const mockPlayer = {
  currentStatus: { playbackState: 'ready' },
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
  mockPlayer.currentStatus.playbackState = 'ready';
  mockPlayer.addListener.mockReset().mockReturnValue({ remove: jest.fn() });
  mockPlayer.play.mockReset();
  mockPlayer.pause.mockReset();
  mockPlayer.release.mockReset();
  mockDelete.mockReset();
  mockReleaseSession.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
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
  const onPhase = jest.fn();
  const speaking = createDeepseekSpeech(async () => 'stella').speak({
    text: 'a'.repeat(140) + 'b'.repeat(400) + 'c',
    language: 'en-US',
    signal: new AbortController().signal,
    playback: { onPhase, onProgress: jest.fn(), onControls: jest.fn() },
  });

  await firstRequested.promise;
  expect(mockRequest).toHaveBeenCalledTimes(1);
  expect(File).not.toHaveBeenCalled();
  first.resolve(wav());
  await firstPlay.promise;
  expect(mockRequest.mock.calls.map(([request]) => request.body.text.length)).toEqual([140, 400]);
  expect(File).toHaveBeenCalledTimes(1);
  expect(mockCreatePlayer).toHaveBeenCalledTimes(1);
  expect(onPhase).toHaveBeenCalledWith('preparing');
  expect(onPhase).not.toHaveBeenCalledWith('playing');
  updatePlayback({ playing: false });
  updatePlayback({ playing: true });
  updatePlayback({ playing: true });
  expect(onPhase.mock.calls.filter(([phase]) => phase === 'playing')).toHaveLength(1);

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
  expect(onPhase.mock.calls).toEqual([['preparing'], ['playing']]);
  expect(mockDelete).toHaveBeenCalledTimes(3);
  expect(mockReleaseSession).toHaveBeenCalledTimes(1);
});

test('reports playback once when the first chunk finishes without a native start', async () => {
  mockRequest.mockResolvedValue(wav());
  const [firstPlay, secondPlay, thirdPlay] = playbackGates(3);
  const onPhase = jest.fn();
  const speaking = createDeepseekSpeech(async () => 'stella').speak({
    text: 'a'.repeat(541),
    language: 'en-US',
    signal: new AbortController().signal,
    playback: { onPhase, onProgress: jest.fn(), onControls: jest.fn() },
  });

  await firstPlay.promise;
  updatePlayback({ didJustFinish: true });

  await secondPlay.promise;
  const callsBeforeSecondStart = onPhase.mock.calls.length;
  updatePlayback({ playing: true });
  updatePlayback({ didJustFinish: true });

  await thirdPlay.promise;
  const callsBeforeThirdStart = onPhase.mock.calls.length;
  updatePlayback({ playing: true });
  updatePlayback({ didJustFinish: true });

  await speaking;
  expect(callsBeforeSecondStart).toBe(2);
  expect(callsBeforeThirdStart).toBe(2);
  expect(onPhase.mock.calls).toEqual([['preparing'], ['playing']]);
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

test('on Android pause detaches player so stale events cannot re-pause resumed playback, and resume waits for native start', async () => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  const audioModule = jest.requireMock<{ createAudioPlayer: () => unknown }>('expo-audio');

  const listeners: ((status: Record<string, unknown>) => void)[] = [];
  const makePlayer = (initialTime: number) => ({
    currentTime: initialTime,
    currentStatus: { playbackState: 'ready' },
    muted: false,
    volume: 1,
    addListener: jest.fn((_event: string, cb: (status: Record<string, unknown>) => void) => {
      listeners.push(cb);
      return { remove: jest.fn() };
    }),
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(async () => {}),
    release: jest.fn(),
  });
  const players = [makePlayer(1.75), makePlayer(0), makePlayer(0)];
  let playerIndex = 0;
  const spy = jest
    .spyOn(audioModule, 'createAudioPlayer')
    .mockImplementation(() => players[playerIndex++]!);

  const controller = new AbortController();
  const phases: string[] = [];
  const progresses: { completedChunks: number; totalChunks: number }[] = [];
  const onInterrupted = jest.fn(() => controlsHolder.current?.pause());
  const controlsHolder: { current: { pause(): void; resume(): string | void } | null } = {
    current: null,
  };

  mockRequest.mockResolvedValueOnce(wav());

  try {
    const speech = createDeepseekSpeech(async () => 'stella');
    const speaking = speech.speak({
      text: 'Hello.',
      language: 'en-US',
      signal: controller.signal,
      playback: {
        onPhase: (phase) => phases.push(phase),
        onProgress: (progress) => progresses.push(progress),
        onControls: (next) => {
          controlsHolder.current = next;
        },
        onInterrupted,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(players[0]!.play).toHaveBeenCalledTimes(1);
    listeners[0]?.({ isLoaded: true, playing: true, isBuffering: false, didJustFinish: false });
    expect(progresses).toEqual([{ completedChunks: 0, totalChunks: 1 }]);
    expect(phases).toEqual(['preparing', 'playing']);
    const controls = controlsHolder.current;
    expect(controls).not.toBeNull();
    if (!controls) throw new Error('Expected controls to be registered');

    controls.pause();
    expect(players[0]!.muted).toBe(true);
    expect(players[0]!.volume).toBe(0);
    expect(players[0]!.pause).toHaveBeenCalledTimes(1);
    expect(players[0]!.release).toHaveBeenCalledTimes(1);
    expect(phases.at(-1)).toBe('paused');

    // Resume creates a new player in preparing state and seeks without claiming playing before native start.
    expect(controls.resume()).toBe('preparing');
    expect(phases.at(-1)).toBe('preparing');
    expect(players[1]!.seekTo).toHaveBeenCalledWith(1.75);

    // Delayed queued [playing: true, playing: false] from the released player must never trigger interruption or pause player 1.
    listeners[0]?.({ isLoaded: true, playing: true, isBuffering: false, didJustFinish: false });
    listeners[0]?.({ isLoaded: true, playing: false, isBuffering: false, didJustFinish: false });
    expect(onInterrupted).not.toHaveBeenCalled();
    expect(players[1]!.pause).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(players[1]!.play).toHaveBeenCalledTimes(1);
    expect(phases.at(-1)).toBe('preparing');

    listeners[1]?.({ isLoaded: true, playing: true, isBuffering: false, didJustFinish: false });
    expect(phases.at(-1)).toBe('playing');

    // Unexpected playing:false on the active player delegates to onInterrupted rather than aborting.
    listeners[1]?.({ isLoaded: true, playing: false, isBuffering: false, didJustFinish: false });
    expect(onInterrupted).toHaveBeenCalledTimes(1);
    expect(phases.at(-1)).toBe('paused');
    expect(players[1]!.release).toHaveBeenCalledTimes(1);

    expect(controls.resume()).toBe('preparing');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(players[2]!.seekTo).toHaveBeenCalledWith(1.75);
    expect(phases.at(-1)).toBe('preparing');
    listeners[2]?.({ isLoaded: true, playing: false, isBuffering: false, didJustFinish: true });
    await expect(speaking).resolves.toBeUndefined();
    expect(phases.at(-1)).toBe('playing');
    expect(progresses.at(-1)).toEqual({ completedChunks: 1, totalChunks: 1 });
    expect(players[2]!.release).toHaveBeenCalledTimes(1);
    expect(controlsHolder.current).toBeNull();
  } finally {
    spy.mockRestore();
  }
});

test('finishes the last Android chunk if pause arrives before the queued end event', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  mockRequest.mockResolvedValueOnce(wav());
  const [started] = playbackGates(1);
  const onProgress = jest.fn();
  const controls: { current: SpeechPlaybackControls | null } = { current: null };
  const reading = createDeepseekSpeech(async () => 'stella').speak({
    text: 'Hello.',
    language: 'en-US',
    signal: new AbortController().signal,
    playback: {
      onPhase: jest.fn(),
      onProgress,
      onControls: (next) => {
        controls.current = next;
      },
    },
  });

  await started.promise;
  updatePlayback({ playing: true });
  mockPlayer.currentStatus.playbackState = 'ended';
  controls.current!.pause();

  await expect(reading).resolves.toBeUndefined();
  expect(onProgress).toHaveBeenLastCalledWith({ completedChunks: 1, totalChunks: 1 });
  expect(controls.current).toBeNull();
  expect(mockPlayer.release).toHaveBeenCalledTimes(1);
});

test('pauses watchdog timer while paused and re-arms on resume', async () => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.replaceProperty(Platform, 'OS', 'android');
  try {
    const controller = new AbortController();
    let listener: ((status: Record<string, unknown>) => void) | undefined;
    const controlsHolder: { current: { pause(): void; resume(): string | void } | null } = {
      current: null,
    };

    mockRequest.mockResolvedValueOnce(wav());
    mockPlayer.addListener.mockImplementation((_event, callback) => {
      listener = callback;
      return { remove: jest.fn() };
    });
    mockPlayer.play.mockImplementation(() => {
      listener?.({ isLoaded: true, playing: true, isBuffering: false, didJustFinish: false });
    });

    const speech = createDeepseekSpeech(async () => 'stella');
    const speaking = speech.speak({
      text: 'Hello.',
      language: 'en-US',
      signal: controller.signal,
      playback: {
        onPhase: jest.fn(),
        onProgress: jest.fn(),
        onControls: (next) => {
          controlsHolder.current = next;
        },
      },
    });

    await jest.advanceTimersByTimeAsync(0);
    const controls = controlsHolder.current;
    if (!controls) throw new Error('Expected controls');

    controls.pause();
    expect(mockPlayer.release).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(15 * 60_000);
    // Watchdog must not time out while paused.
    expect(mockPlayer.release).toHaveBeenCalledTimes(1);

    controls.resume();
    listener?.({ isLoaded: true, playing: false, isBuffering: false, didJustFinish: true });
    await expect(speaking).resolves.toBeUndefined();
    expect(mockPlayer.release).toHaveBeenCalledTimes(2);
  } finally {
    jest.useRealTimers();
  }
});

test('stays in preparing when resumed while waiting on next-chunk prefetch after pause', async () => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  const second = deferred<ReturnType<typeof wav>>();
  mockRequest.mockResolvedValueOnce(wav()).mockReturnValueOnce(second.promise);
  const [firstPlay, secondPlay] = playbackGates(2);
  const phases: string[] = [];
  const controlsHolder: { current: { pause(): void; resume(): string | void } | null } = {
    current: null,
  };

  const speaking = createDeepseekSpeech(async () => 'stella').speak({
    text: 'a'.repeat(141),
    language: 'en-US',
    signal: new AbortController().signal,
    playback: {
      onPhase: (phase) => phases.push(phase),
      onProgress: jest.fn(),
      onControls: (next) => {
        controlsHolder.current = next;
      },
    },
  });

  await firstPlay.promise;
  updatePlayback({ playing: true });
  updatePlayback({ didJustFinish: true });
  await Promise.resolve();

  // Pausing while next-chunk prefetch is still pending and resuming must remain in preparing until chunk 1 starts playing.
  controlsHolder.current!.pause();
  expect(phases.at(-1)).toBe('paused');
  expect(controlsHolder.current!.resume()).toBe('preparing');
  expect(phases.at(-1)).toBe('preparing');

  second.resolve(wav());
  await secondPlay.promise;
  expect(phases.at(-1)).toBe('preparing');
  updatePlayback({ playing: true });
  updatePlayback({ didJustFinish: true });
  await expect(speaking).resolves.toBeUndefined();
  expect(phases).toEqual(['preparing', 'playing', 'paused', 'preparing', 'playing']);
});

test('on iOS pause releases the player so expo-audio cannot resume on interruption end, then resume recreates and seeks', async () => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'ios');
  const audioModule = jest.requireMock<{ createAudioPlayer: () => unknown }>('expo-audio');

  const seekGate1: { resolve?: () => void } = {};
  const listeners: ((status: Record<string, unknown>) => void)[] = [];
  const lifecycleEvents: string[] = [];
  const phases: string[] = [];
  const makePlayer = (idx: number, initialTime: number, customSeek?: () => Promise<void>) => {
    const player = {
      currentTime: initialTime,
      muted: false,
      volume: 1,
      addListener: jest.fn((_event: string, cb: (status: Record<string, unknown>) => void) => {
        listeners.push(cb);
        return { remove: jest.fn() };
      }),
      play: jest.fn(),
      pause: jest.fn(),
      seekTo: jest.fn(customSeek ?? (async () => {})),
      replace: jest.fn(() => {
        lifecycleEvents.push(`replace:${idx}`);
        player.currentTime = 0;
      }),
      release: jest.fn(() => {
        lifecycleEvents.push(`release:${idx}`);
      }),
    };
    return player;
  };
  const players = [
    makePlayer(0, 3.25),
    makePlayer(
      1,
      0,
      () =>
        new Promise<void>((resolve) => {
          seekGate1.resolve = resolve;
        }),
    ),
    makePlayer(2, 0),
  ];
  let index = 0;
  const spy = jest
    .spyOn(audioModule, 'createAudioPlayer')
    .mockImplementation(() => players[index++]!);

  mockRequest.mockResolvedValueOnce(wav());
  const controlsHolder: { current: { pause(): void; resume(): string | void } | null } = {
    current: null,
  };

  try {
    const speech = createDeepseekSpeech(async () => 'stella');
    const speaking = speech.speak({
      text: 'Hello.',
      language: 'en-US',
      signal: new AbortController().signal,
      playback: {
        onPhase: (phase) => phases.push(phase),
        onProgress: jest.fn(),
        onControls: (next) => {
          controlsHolder.current = next;
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(players[0]!.play).toHaveBeenCalledTimes(1);
    listeners[0]?.({ isLoaded: true, playing: true, isBuffering: false, didJustFinish: false });
    expect(phases.at(-1)).toBe('playing');

    // Pausing on iOS captures position, mutes & strips AVPlayerItem before release so a concurrent snapshot cannot emit sound.
    controlsHolder.current!.pause();
    expect(players[0]!.pause).not.toHaveBeenCalled();
    expect(players[0]!.muted).toBe(true);
    expect(players[0]!.volume).toBe(0);
    expect(players[0]!.replace).toHaveBeenCalledWith(null);
    expect(players[0]!.release).toHaveBeenCalledTimes(1);
    expect(lifecycleEvents.slice(0, 2)).toEqual(['replace:0', 'release:0']);
    expect(phases.at(-1)).toBe('paused');

    // Resuming spawns player 1 in preparing state and seeks to 3.25s; pausing again while seekTo is pending cancels play.
    expect(controlsHolder.current!.resume()).toBe('preparing');
    expect(phases.at(-1)).toBe('preparing');
    expect(players[1]!.seekTo).toHaveBeenCalledWith(3.25);
    expect(players[1]!.play).not.toHaveBeenCalled();
    controlsHolder.current!.pause();
    expect(players[1]!.muted).toBe(true);
    expect(players[1]!.volume).toBe(0);
    expect(players[1]!.replace).toHaveBeenCalledWith(null);
    expect(players[1]!.release).toHaveBeenCalledTimes(1);
    seekGate1.resolve?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(players[1]!.play).not.toHaveBeenCalled();

    // Resuming again preserves captured 3.25s position onto player 2 and only marks playing once native confirms.
    expect(controlsHolder.current!.resume()).toBe('preparing');
    expect(phases.at(-1)).toBe('preparing');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(players[2]!.seekTo).toHaveBeenCalledWith(3.25);
    expect(players[2]!.play).toHaveBeenCalledTimes(1);
    expect(phases.at(-1)).toBe('preparing');
    listeners[2]?.({ isLoaded: true, playing: false, isBuffering: false, didJustFinish: true });
    await expect(speaking).resolves.toBeUndefined();
    expect(phases.at(-1)).toBe('playing');
    expect(players[2]!.release).toHaveBeenCalledTimes(1);
  } finally {
    spy.mockRestore();
  }
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
