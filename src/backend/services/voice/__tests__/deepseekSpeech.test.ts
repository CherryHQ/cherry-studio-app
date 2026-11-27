import { Platform } from 'react-native';

import { createDeepseekSpeech } from '../deepseekSpeech';

const mockRequest = jest.fn();
const mockPlayer = {
  addListener: jest.fn(),
  play: jest.fn(),
  pause: jest.fn(),
  release: jest.fn(),
};

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-audio', () => ({ createAudioPlayer: () => mockPlayer }));
jest.mock('expo-file-system', () => ({
  File: jest.fn(() => ({
    uri: 'file:///cache/speech.wav',
    exists: true,
    writeSync: jest.fn(),
    delete: jest.fn(),
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
    acquire: async () => async () => {},
    playback: async () => {},
  },
}));

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
    mockRequest.mockResolvedValueOnce({
      data: new TextEncoder().encode('RIFF    WAVE'.padEnd(44)).buffer,
      headers: { 'content-type': 'audio/wav' },
    });
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

test('pauses and resumes active playback without treating delayed pause events as interruptions', async () => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  const controller = new AbortController();
  let listener: ((status: Record<string, unknown>) => void) | undefined;
  const phases: string[] = [];
  const progresses: { completedChunks: number; totalChunks: number }[] = [];
  const onInterrupted = jest.fn(() => controlsHolder.current?.pause());
  const controlsHolder: { current: { pause(): void; resume(): string | void } | null } = {
    current: null,
  };

  mockRequest.mockResolvedValueOnce({
    data: new TextEncoder().encode('RIFF    WAVE'.padEnd(44)).buffer,
    headers: { 'content-type': 'audio/wav' },
  });
  mockPlayer.addListener.mockImplementationOnce((_event, callback) => {
    listener = callback;
    return { remove: jest.fn() };
  });
  mockPlayer.play.mockImplementation(() => {
    listener?.({ isLoaded: true, playing: true, isBuffering: false, didJustFinish: false });
  });
  // Intentionally do not emit playing:false synchronously on pause so we can deliver it late after resume.
  mockPlayer.pause.mockImplementation(() => {});

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
  expect(progresses).toEqual([{ completedChunks: 0, totalChunks: 1 }]);
  expect(phases).toEqual(['preparing', 'playing']);
  const controls = controlsHolder.current;
  expect(controls).not.toBeNull();
  if (!controls) throw new Error('Expected controls to be registered');

  controls.pause();
  expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
  expect(phases.at(-1)).toBe('paused');

  // Queued playing:true followed by playing:false from the prior pause must keep paused intent and never abort.
  listener?.({ isLoaded: true, playing: true, isBuffering: false, didJustFinish: false });
  expect(phases.at(-1)).toBe('paused');
  expect(mockPlayer.pause).toHaveBeenCalledTimes(2);
  listener?.({ isLoaded: true, playing: false, isBuffering: false, didJustFinish: false });
  expect(onInterrupted).not.toHaveBeenCalled();
  expect(mockPlayer.release).not.toHaveBeenCalled();

  // Resume first, then simulate delayed playing:false from the prior pause arriving before the new play confirms.
  mockPlayer.play.mockImplementationOnce(() => {});
  controls.resume();
  listener?.({ isLoaded: true, playing: false, isBuffering: false, didJustFinish: false });
  expect(onInterrupted).not.toHaveBeenCalled();
  expect(mockPlayer.release).not.toHaveBeenCalled();

  listener?.({ isLoaded: true, playing: true, isBuffering: false, didJustFinish: false });
  expect(phases.at(-1)).toBe('playing');

  // Unexpected playing:false while active notifies the runtime via onInterrupted rather than aborting.
  listener?.({ isLoaded: true, playing: false, isBuffering: false, didJustFinish: false });
  expect(onInterrupted).toHaveBeenCalledTimes(1);
  expect(phases.at(-1)).toBe('paused');

  controls.resume();
  listener?.({ isLoaded: true, playing: false, isBuffering: false, didJustFinish: true });
  await expect(speaking).resolves.toBeUndefined();
  expect(progresses.at(-1)).toEqual({ completedChunks: 1, totalChunks: 1 });
  expect(mockPlayer.release).toHaveBeenCalledTimes(1);
  expect(controlsHolder.current).toBeNull();
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

    mockRequest.mockResolvedValueOnce({
      data: new TextEncoder().encode('RIFF    WAVE'.padEnd(44)).buffer,
      headers: { 'content-type': 'audio/wav' },
    });
    mockPlayer.addListener.mockImplementationOnce((_event, callback) => {
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
    await jest.advanceTimersByTimeAsync(15 * 60_000);
    // Watchdog must not time out while paused.
    expect(mockPlayer.release).not.toHaveBeenCalled();

    controls.resume();
    listener?.({ isLoaded: true, playing: false, isBuffering: false, didJustFinish: true });
    await expect(speaking).resolves.toBeUndefined();
    expect(mockPlayer.release).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

test('on iOS pause releases the player so expo-audio cannot resume on interruption end, then resume recreates and seeks', async () => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'ios');
  const audioModule = jest.requireMock<{ createAudioPlayer: () => unknown }>('expo-audio');

  const seekGate1: { resolve?: () => void } = {};
  const listeners: ((status: Record<string, unknown>) => void)[] = [];
  const lifecycleEvents: string[] = [];
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

  mockRequest.mockResolvedValueOnce({
    data: new TextEncoder().encode('RIFF    WAVE'.padEnd(44)).buffer,
    headers: { 'content-type': 'audio/wav' },
  });
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
        onPhase: jest.fn(),
        onProgress: jest.fn(),
        onControls: (next) => {
          controlsHolder.current = next;
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(players[0]!.play).toHaveBeenCalledTimes(1);
    listeners[0]?.({ isLoaded: true, playing: true, isBuffering: false, didJustFinish: false });

    // Pausing on iOS captures position, mutes & strips AVPlayerItem before release so a concurrent snapshot cannot emit sound.
    controlsHolder.current!.pause();
    expect(players[0]!.pause).not.toHaveBeenCalled();
    expect(players[0]!.muted).toBe(true);
    expect(players[0]!.volume).toBe(0);
    expect(players[0]!.replace).toHaveBeenCalledWith(null);
    expect(players[0]!.release).toHaveBeenCalledTimes(1);
    expect(lifecycleEvents.slice(0, 2)).toEqual(['replace:0', 'release:0']);

    // Resuming spawns player 1 and seeks to 3.25s; pausing again while seekTo is pending cancels play.
    controlsHolder.current!.resume();
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

    // Resuming again preserves captured 3.25s position onto player 2 and finishes normally.
    controlsHolder.current!.resume();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(players[2]!.seekTo).toHaveBeenCalledWith(3.25);
    expect(players[2]!.play).toHaveBeenCalledTimes(1);
    listeners[2]?.({ isLoaded: true, playing: false, isBuffering: false, didJustFinish: true });
    await expect(speaking).resolves.toBeUndefined();
    expect(players[2]!.release).toHaveBeenCalledTimes(1);
  } finally {
    spy.mockRestore();
  }
});
