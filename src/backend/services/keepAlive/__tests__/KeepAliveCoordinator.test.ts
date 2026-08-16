import { AppState, type AppStateStatus, Platform } from 'react-native';

const mockPlayer = {
  addListener: jest.fn(
    (
      _event: string,
      listener: (status: { isBuffering: boolean; isLoaded: boolean; playing: boolean }) => void,
    ) => {
      mockPlaybackStatusListener = listener;
      return { remove: mockPlayerStatusRemove };
    },
  ),
  loop: false,
  pause: jest.fn(),
  play: jest.fn(),
  remove: jest.fn(),
  volume: 1,
};
const mockPlayerStatusRemove = jest.fn();
let mockPlaybackStatusListener:
  | ((status: { isBuffering: boolean; isLoaded: boolean; playing: boolean }) => void)
  | undefined;
const mockCreateAudioPlayer = jest.fn(() => mockPlayer);
const mockSetAudioModeAsync = jest.fn(async () => {});

jest.mock('expo-audio', () => ({
  createAudioPlayer: mockCreateAudioPlayer,
  setAudioModeAsync: mockSetAudioModeAsync,
}));
// Jest hoists the mock factories, so initialize their captured constants before this import.
const coordinatorModule =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../KeepAliveCoordinator') as typeof import('../KeepAliveCoordinator');
const { KeepAliveCoordinator } = coordinatorModule;

describe('KeepAliveCoordinator', () => {
  let appStateListener: ((state: AppStateStatus) => void) | undefined;

  beforeEach(() => {
    appStateListener = undefined;
    mockPlaybackStatusListener = undefined;
    mockPlayer.loop = false;
    mockPlayer.volume = 1;
    jest.clearAllMocks();
    mockCreateAudioPlayer.mockImplementation(() => mockPlayer);
    mockSetAudioModeAsync.mockResolvedValue(undefined);
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() };
    });
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('shares one audio session across holders and stops on the last release', async () => {
    const coordinator = new KeepAliveCoordinator();
    await coordinator._doInit();
    const first = coordinator.acquire('chat');
    const second = coordinator.acquire('jobs');
    await flushOperations();

    expect(mockSetAudioModeAsync).toHaveBeenCalledTimes(1);
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
    expect(mockPlayer.loop).toBe(true);
    expect(mockPlayer.volume).toBeCloseTo(0.001);

    first.release();
    await flushOperations();
    expect(mockPlayer.pause).not.toHaveBeenCalled();

    second.release();
    await flushOperations();
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    expect(mockPlayer.remove).toHaveBeenCalledTimes(1);
    expect(mockPlayerStatusRemove).toHaveBeenCalledTimes(1);

    await coordinator._doStop();
  });

  test('treats release as idempotent per lease', async () => {
    const coordinator = new KeepAliveCoordinator();
    await coordinator._doInit();
    const first = coordinator.acquire('chat');
    const second = coordinator.acquire('jobs');
    await flushOperations();

    first.release();
    first.release();
    await flushOperations();
    expect(mockPlayer.pause).not.toHaveBeenCalled();

    second.release();
    await flushOperations();
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);

    await coordinator._doStop();
  });

  test('resumes playback after an interruption while a lease is held', async () => {
    const coordinator = new KeepAliveCoordinator();
    await coordinator._doInit();
    const lease = coordinator.acquire('chat');
    await flushOperations();

    mockPlaybackStatusListener?.({ isBuffering: false, isLoaded: true, playing: false });
    expect(mockPlayer.play).toHaveBeenCalledTimes(2);

    lease.release();
    await flushOperations();
    mockPlaybackStatusListener?.({ isBuffering: false, isLoaded: true, playing: false });
    expect(mockPlayer.play).toHaveBeenCalledTimes(2);

    await coordinator._doStop();
  });

  test('retries a failed session start when the app enters the background', async () => {
    mockSetAudioModeAsync.mockRejectedValueOnce(new Error('audio session busy'));
    const coordinator = new KeepAliveCoordinator();
    await coordinator._doInit();
    const lease = coordinator.acquire('chat');
    await flushOperations();
    expect(mockCreateAudioPlayer).not.toHaveBeenCalled();

    appStateListener?.('background');
    await flushOperations();
    expect(mockSetAudioModeAsync).toHaveBeenCalledTimes(2);
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);

    lease.release();
    await coordinator._doStop();
  });

  test('retries one failed start at a time with capped exponential backoff', async () => {
    jest.useFakeTimers();
    mockSetAudioModeAsync.mockRejectedValue(new Error('audio session busy'));
    const coordinator = new KeepAliveCoordinator();
    await coordinator._doInit();
    const lease = coordinator.acquire('chat');
    await flushMicrotasks();
    expect(mockSetAudioModeAsync).toHaveBeenCalledTimes(1);

    for (const [index, delayMs] of [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000].entries()) {
      await jest.advanceTimersByTimeAsync(delayMs - 1);
      expect(mockSetAudioModeAsync).toHaveBeenCalledTimes(index + 1);
      await jest.advanceTimersByTimeAsync(1);
      expect(mockSetAudioModeAsync).toHaveBeenCalledTimes(index + 2);
    }
    expect(jest.getTimerCount()).toBe(1);

    lease.release();
    await flushMicrotasks();
    expect(jest.getTimerCount()).toBe(0);
    await coordinator._doStop();
  });

  test('clears a pending retry when the last lease is released', async () => {
    jest.useFakeTimers();
    mockSetAudioModeAsync.mockRejectedValueOnce(new Error('audio session busy'));
    const coordinator = new KeepAliveCoordinator();
    await coordinator._doInit();
    const lease = coordinator.acquire('chat');
    await flushMicrotasks();
    expect(mockSetAudioModeAsync).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1);

    lease.release();
    await flushMicrotasks();
    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(mockSetAudioModeAsync).toHaveBeenCalledTimes(1);
    await coordinator._doStop();
  });

  test('clears retry state after a successful retry', async () => {
    jest.useFakeTimers();
    mockSetAudioModeAsync.mockRejectedValueOnce(new Error('audio session busy'));
    const coordinator = new KeepAliveCoordinator();
    await coordinator._doInit();
    const lease = coordinator.acquire('chat');
    await flushMicrotasks();

    await jest.advanceTimersByTimeAsync(1_000);
    expect(mockSetAudioModeAsync).toHaveBeenCalledTimes(2);
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);

    lease.release();
    await flushMicrotasks();
    await coordinator._doStop();
  });

  test('removes the audio player even when pause throws', async () => {
    const coordinator = new KeepAliveCoordinator();
    await coordinator._doInit();
    const lease = coordinator.acquire('chat');
    await flushOperations();
    mockPlayer.pause.mockImplementationOnce(() => {
      throw new Error('pause failed');
    });

    expect(() => lease.release()).not.toThrow();
    await flushOperations();
    expect(mockPlayer.remove).toHaveBeenCalledTimes(1);
    expect(mockPlayerStatusRemove).toHaveBeenCalledTimes(1);

    await coordinator._doStop();
  });

  test('creates a new player after the previous session stops cleanly', async () => {
    const coordinator = new KeepAliveCoordinator();
    await coordinator._doInit();
    const first = coordinator.acquire('chat');
    await flushOperations();
    first.release();
    await flushOperations();

    const second = coordinator.acquire('jobs');
    await flushOperations();
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(2);
    expect(mockPlayer.play).toHaveBeenCalledTimes(2);

    second.release();
    await flushOperations();
    await coordinator._doStop();
  });

  test('stops audio on stop and no-ops later acquires', async () => {
    const coordinator = new KeepAliveCoordinator();
    await coordinator._doInit();
    coordinator.acquire('chat');
    await flushOperations();
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);

    await coordinator._doStop();
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    expect(mockPlayer.remove).toHaveBeenCalledTimes(1);

    const lease = coordinator.acquire('late');
    lease.release();
    await flushOperations();
    expect(mockSetAudioModeAsync).toHaveBeenCalledTimes(1);
  });

  test('no-ops off iOS', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const coordinator = new KeepAliveCoordinator();
    await coordinator._doInit();
    const lease = coordinator.acquire('chat');
    await flushOperations();

    expect(AppState.addEventListener).not.toHaveBeenCalled();
    expect(mockSetAudioModeAsync).not.toHaveBeenCalled();
    lease.release();
    await coordinator._doStop();
  });
});

async function flushOperations() {
  // KeepAliveCoordinator loads expo-audio only on first use so importing the
  // service registry does not initialize a native module. Give that import and
  // the serialized reconciliation queue enough turns to settle.
  for (let index = 0; index < 4; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function flushMicrotasks() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}
