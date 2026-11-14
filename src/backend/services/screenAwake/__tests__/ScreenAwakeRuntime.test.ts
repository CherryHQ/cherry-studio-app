import { loggerService } from '@logger';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { AppState, type AppStateStatus } from 'react-native';

import { ScreenAwakeRuntime } from '..';

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(),
  deactivateKeepAwake: jest.fn(),
}));

jest.mock('@logger', () => {
  const logger = { warn: jest.fn() };
  return { loggerService: { withContext: () => logger } };
});

const activate = jest.mocked(activateKeepAwakeAsync);
const deactivate = jest.mocked(deactivateKeepAwake);
const warn = jest.mocked(loggerService.withContext('ScreenAwake').warn);
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createPreferences(initialEnabled = true) {
  let enabled = initialEnabled;
  const listeners = new Set<() => void>();
  const unsubscribe = jest.fn();
  const readCached = jest.fn().mockImplementation(() => enabled);
  const subscribeChange = jest.fn((_key: string) => (listener: () => void) => {
    listeners.add(listener);
    return () => {
      unsubscribe();
      listeners.delete(listener);
    };
  });
  return {
    port: { readCached, subscribeChange },
    listeners,
    unsubscribe,
    set(value: boolean) {
      enabled = value;
      for (const listener of listeners) listener();
    },
  };
}

describe('ScreenAwakeRuntime', () => {
  let appStateListener: (state: AppStateStatus) => void;
  let removeAppStateListener: jest.Mock;
  let runtimes: ScreenAwakeRuntime[];
  let pending: ReturnType<typeof deferred>[];

  function create(initialEnabled = true) {
    const preferences = createPreferences(initialEnabled);
    const runtime = new ScreenAwakeRuntime(preferences.port);
    runtimes.push(runtime);
    return { runtime, preferences };
  }

  function deferNext(operation: typeof activate) {
    const work = deferred();
    pending.push(work);
    operation.mockReturnValueOnce(work.promise);
    return work;
  }

  beforeEach(() => {
    activate.mockReset().mockResolvedValue(undefined);
    deactivate.mockReset().mockResolvedValue(undefined);
    warn.mockClear();
    runtimes = [];
    pending = [];
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    removeAppStateListener = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appStateListener = listener;
      return { remove: removeAppStateListener };
    });
  });

  afterEach(async () => {
    for (const work of pending) work.resolve();
    for (const runtime of runtimes) await runtime._doStop();
    jest.restoreAllMocks();
  });

  test('does not activate before initialization or without holders', async () => {
    const { runtime } = create();
    const lease = runtime.acquire('early');
    await settle();
    expect(activate).not.toHaveBeenCalled();
    lease.release();
    await runtime._doInit();
    await settle();
    expect(activate).not.toHaveBeenCalled();
    expect(deactivate).not.toHaveBeenCalled();
  });

  test('retains pre-init demand and uses the authoritative AppState at init', async () => {
    const { runtime } = create();
    runtime.acquire('early');
    Object.defineProperty(AppState, 'currentState', { value: 'background' });
    await runtime._doInit();
    await settle();
    expect(activate).not.toHaveBeenCalled();
    appStateListener('active');
    await settle();
    expect(activate).toHaveBeenCalledTimes(1);
  });

  test('tracks demand while disabled and activates when enabled during existing work', async () => {
    const { runtime, preferences } = create(false);
    await runtime._doInit();
    runtime.acquire('reply');
    await settle();
    expect(activate).not.toHaveBeenCalled();
    expect(preferences.port.readCached).toHaveBeenCalledWith('app.keep_screen_on.enabled');
    expect(preferences.port.subscribeChange).toHaveBeenCalledWith('app.keep_screen_on.enabled');
    preferences.set(true);
    await settle();
    expect(activate).toHaveBeenCalledTimes(1);
    preferences.set(false);
    await settle();
    expect(deactivate).toHaveBeenCalledTimes(1);
  });

  test('follows optimistic preference changes and a persistence-failure rollback', async () => {
    const { runtime, preferences } = create();
    await runtime._doInit();
    runtime.acquire('reply');
    await settle();
    preferences.set(false);
    await settle();
    expect(deactivate).toHaveBeenCalledTimes(1);
    preferences.set(true);
    await settle();
    expect(activate).toHaveBeenCalledTimes(2);
  });

  test('activates once for the first holder and releases only the last distinct acquisition, including same tags', async () => {
    const { runtime } = create();
    await runtime._doInit();
    const leases = Array.from({ length: 128 }, () => runtime.acquire('same diagnostic tag'));
    await settle();
    expect(activate).toHaveBeenCalledTimes(1);
    for (const lease of leases.slice(0, -1)) {
      lease.release();
      lease.release();
    }
    await settle();
    expect(deactivate).not.toHaveBeenCalled();
    leases[127].release();
    await settle();
    expect(deactivate).toHaveBeenCalledTimes(1);
    leases[127].release();
    leases[0].release();
    await settle();
    expect(activate).toHaveBeenCalledTimes(1);
    expect(deactivate).toHaveBeenCalledTimes(1);
  });

  test('uses one unique non-default native tag per runtime, independent of diagnostic tags', async () => {
    const first = create().runtime;
    const second = create().runtime;
    await first._doInit();
    await second._doInit();
    const firstLease = first.acquire('reply');
    const secondLease = second.acquire('reply');
    await settle();
    const tags = activate.mock.calls.map(([tag]) => tag);
    expect(new Set(tags).size).toBe(2);
    for (const tag of tags) {
      expect(tag).toMatch(/^cherry\.screenAwake\./);
      expect(tag).not.toBe('ExpoKeepAwakeDefaultTag');
      expect(tag).not.toBe('reply');
    }
    firstLease.release();
    secondLease.release();
    await settle();
    expect(deactivate.mock.calls.map(([tag]) => tag)).toEqual(tags);
  });

  test('active to inactive to active releases and reacquires existing demand', async () => {
    const { runtime } = create();
    await runtime._doInit();
    runtime.acquire('reply');
    await settle();
    appStateListener('inactive');
    await settle();
    expect(deactivate).toHaveBeenCalledTimes(1);
    appStateListener('active');
    await settle();
    expect(activate).toHaveBeenCalledTimes(2);
  });

  test('tracks hidden work but release while hidden prevents reacquisition', async () => {
    const { runtime } = create();
    await runtime._doInit();
    appStateListener('background');
    const finished = runtime.acquire('translation');
    await settle();
    expect(activate).not.toHaveBeenCalled();
    finished.release();
    appStateListener('active');
    await settle();
    expect(activate).not.toHaveBeenCalled();
    const active = runtime.acquire('image');
    await settle();
    appStateListener('background');
    await settle();
    active.release();
    appStateListener('active');
    await settle();
    expect(activate).toHaveBeenCalledTimes(1);
    expect(deactivate).toHaveBeenCalledTimes(1);
  });

  test('initial null AppState stays off until an active event', async () => {
    Object.defineProperty(AppState, 'currentState', { value: null });
    const { runtime } = create();
    await runtime._doInit();
    runtime.acquire('reply');
    await settle();
    expect(activate).not.toHaveBeenCalled();
    appStateListener('active');
    await settle();
    expect(activate).toHaveBeenCalledTimes(1);
  });

  test('serializes release behind pending activation and cleans up when activation settles', async () => {
    const activation = deferNext(activate);
    const { runtime } = create();
    await runtime._doInit();
    const lease = runtime.acquire('reply');
    await settle();
    lease.release();
    await settle();
    expect(deactivate).not.toHaveBeenCalled();
    activation.resolve();
    await settle();
    expect(deactivate).toHaveBeenCalledTimes(1);
    expect(deactivate).toHaveBeenCalledWith(activate.mock.calls[0][0]);
  });

  test('serializes new demand behind pending deactivation and activates after it settles', async () => {
    const { runtime } = create();
    await runtime._doInit();
    const lease = runtime.acquire('reply');
    await settle();
    const cleanup = deferNext(deactivate);
    lease.release();
    await settle();
    runtime.acquire('translation');
    await settle();
    expect(activate).toHaveBeenCalledTimes(1);
    cleanup.resolve();
    await settle();
    expect(activate).toHaveBeenCalledTimes(2);
  });

  test('rechecks current demand after pending operations instead of replaying stale activation', async () => {
    const { runtime } = create();
    await runtime._doInit();
    const lease = runtime.acquire('reply');
    await settle();
    const cleanup = deferNext(deactivate);
    lease.release();
    await settle();
    const finished = runtime.acquire('translation');
    finished.release();
    cleanup.resolve();
    await settle();
    expect(activate).toHaveBeenCalledTimes(1);
    expect(deactivate).toHaveBeenCalledTimes(1);
  });

  test('logs activation rejection, cleans uncertain state, and allows later work', async () => {
    const failure = new Error('activation failed');
    activate.mockRejectedValueOnce(failure);
    const { runtime } = create();
    await runtime._doInit();
    const lease = runtime.acquire('reply');
    await settle();
    expect(warn).toHaveBeenCalledWith('Failed to activate screen awake', failure);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(() => lease.release()).not.toThrow();
    await settle();
    expect(deactivate).toHaveBeenCalledTimes(1);
    runtime.acquire('later work');
    await settle();
    expect(activate).toHaveBeenCalledTimes(2);
  });

  test('retries failed activation on the next foreground transition with retained demand', async () => {
    activate.mockRejectedValueOnce(new Error('activation failed'));
    const { runtime } = create();
    await runtime._doInit();
    runtime.acquire('reply');
    await settle();
    appStateListener('background');
    await settle();
    appStateListener('active');
    await settle();
    expect(deactivate).toHaveBeenCalledTimes(1);
    expect(activate).toHaveBeenCalledTimes(2);
  });

  test('keeps failed cleanup uncertain without looping and retries on return to active with zero holders', async () => {
    const { runtime, preferences } = create();
    await runtime._doInit();
    const lease = runtime.acquire('reply');
    await settle();
    const cleanup = deferNext(deactivate);
    appStateListener('background');
    await settle();
    cleanup.reject(new Error('cleanup failed'));
    await settle();
    lease.release();
    deactivate.mockRejectedValueOnce(new Error('cleanup still failed'));
    await settle();
    expect(deactivate).toHaveBeenCalledTimes(2);
    lease.release();
    preferences.set(true);
    appStateListener('background');
    await settle();
    expect(deactivate).toHaveBeenCalledTimes(2);
    appStateListener('active');
    await settle();
    expect(deactivate).toHaveBeenCalledTimes(3);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Failed to deactivate screen awake', expect.any(Error));
  });

  test('deactivation rejection does not poison later demand', async () => {
    const { runtime } = create();
    await runtime._doInit();
    const lease = runtime.acquire('reply');
    await settle();
    deactivate.mockRejectedValueOnce(new Error('cleanup failed'));
    lease.release();
    await settle();
    runtime.acquire('image');
    await settle();
    expect(activate).toHaveBeenCalledTimes(2);
  });

  test('coalesced transitions do not repeatedly retry failed cleanup without a newer transition', async () => {
    const activation = deferNext(activate);
    const { runtime } = create();
    await runtime._doInit();
    const lease = runtime.acquire('reply');
    await settle();
    lease.release();
    appStateListener('background');
    deactivate.mockRejectedValueOnce(new Error('cleanup failed'));
    activation.reject(new Error('activation failed'));
    await settle();
    expect(activate).toHaveBeenCalledTimes(1);
    expect(deactivate).toHaveBeenCalledTimes(1);
    appStateListener('active');
    await settle();
    expect(deactivate).toHaveBeenCalledTimes(2);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  test('stop waits for pending deactivation and discards demand acquired before stop', async () => {
    const { runtime } = create();
    await runtime._doInit();
    const lease = runtime.acquire('reply');
    await settle();
    const cleanup = deferNext(deactivate);
    lease.release();
    await settle();
    runtime.acquire('translation');
    let stopped = false;
    const stop = runtime._doStop().then(() => {
      stopped = true;
    });
    await settle();
    expect(stopped).toBe(false);
    cleanup.resolve();
    await stop;
    expect(activate).toHaveBeenCalledTimes(1);
    expect(deactivate).toHaveBeenCalledTimes(1);
  });

  test('stop fences acquisitions immediately, removes subscriptions, and awaits activation then cleanup', async () => {
    const activation = deferNext(activate);
    const { runtime, preferences } = create();
    await runtime._doInit();
    const lease = runtime.acquire('reply');
    const latePreferenceCallback = [...preferences.listeners][0];
    await settle();
    const cleanup = deferNext(deactivate);
    let stopped = false;
    const stop = runtime._doStop().then(() => {
      stopped = true;
    });
    expect(preferences.unsubscribe).toHaveBeenCalledTimes(1);
    expect(removeAppStateListener).toHaveBeenCalledTimes(1);
    expect(preferences.listeners.size).toBe(0);
    const reads = preferences.port.readCached.mock.calls.length;
    lease.release();
    runtime.acquire('late').release();
    latePreferenceCallback();
    appStateListener('active');
    await settle();
    expect(stopped).toBe(false);
    expect(deactivate).not.toHaveBeenCalled();
    expect(preferences.port.readCached).toHaveBeenCalledTimes(reads);
    activation.resolve();
    await settle();
    expect(deactivate).toHaveBeenCalledTimes(1);
    expect(stopped).toBe(false);
    cleanup.resolve();
    await stop;
    runtime.acquire('after stop').release();
    latePreferenceCallback();
    appStateListener('active');
    await settle();
    expect(stopped).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(deactivate).toHaveBeenCalledTimes(1);
  });

  test('stop consumes a cleanup rejection and remains terminal', async () => {
    const { runtime } = create();
    await runtime._doInit();
    runtime.acquire('reply');
    await settle();
    deactivate.mockRejectedValueOnce(new Error('cleanup failed'));
    await expect(runtime._doStop()).resolves.toBeUndefined();
    runtime.acquire('late').release();
    await settle();
    expect(activate).toHaveBeenCalledTimes(1);
    expect(deactivate).toHaveBeenCalledTimes(1);
  });
});
