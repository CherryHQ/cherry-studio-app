import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { STARTUP_CONTENT_TIMEOUT_MS, STARTUP_MINIMUM_VISIBLE_MS } from '../startupState';
import { useStartupLifecycle } from '../useStartupLifecycle';

const mockHideAsync = jest.fn(async (): Promise<void> => undefined);
const mockWarn = jest.fn();

jest.mock('expo-splash-screen', () => ({
  hideAsync: () => mockHideAsync(),
}));

jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: {
    withContext: () => ({ warn: (...args: unknown[]) => mockWarn(...args) }),
  },
}));

type Lifecycle = ReturnType<typeof useStartupLifecycle>;

function renderLifecycle(bootstrapReady: boolean, onCoverPresented?: () => void) {
  let current: Lifecycle | undefined;
  let renderer: ReactTestRenderer | undefined;

  function Probe({ ready }: { ready: boolean }) {
    current = useStartupLifecycle(ready, onCoverPresented);
    return null;
  }

  act(() => {
    renderer = create(<Probe ready={bootstrapReady} />);
  });

  return {
    get current() {
      if (!current) {
        throw new Error('The startup lifecycle did not render');
      }
      return current;
    },
    rerender(ready: boolean) {
      act(() => renderer?.update(<Probe ready={ready} />));
    },
    unmount() {
      act(() => renderer?.unmount());
    },
  };
}

function advanceTwoFrames() {
  act(() => jest.advanceTimersToNextTimer());
  act(() => jest.advanceTimersToNextTimer());
}

async function advanceToCoverPresented() {
  advanceTwoFrames();
  await act(async () => Promise.resolve());
  advanceTwoFrames();
}

describe('useStartupLifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(10_000);
    mockHideAsync.mockReset();
    mockHideAsync.mockResolvedValue(undefined);
    mockWarn.mockClear();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('hides the native splash only after the laid-out cover crosses two frames', () => {
    const lifecycle = renderLifecycle(false);

    expect(mockHideAsync).not.toHaveBeenCalled();
    act(() => lifecycle.current.handleCoverLayout());
    act(() => lifecycle.current.handleCoverLayout());
    expect(mockHideAsync).not.toHaveBeenCalled();

    act(() => jest.advanceTimersToNextTimer());
    expect(mockHideAsync).not.toHaveBeenCalled();

    act(() => jest.advanceTimersToNextTimer());

    expect(mockHideAsync).toHaveBeenCalledTimes(1);
    lifecycle.unmount();
  });

  test('reports presentation after the native splash finishes hiding', async () => {
    const onCoverPresented = jest.fn();
    const lifecycle = renderLifecycle(false, onCoverPresented);

    act(() => lifecycle.current.handleCoverLayout());
    advanceTwoFrames();
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
    expect(lifecycle.current.coverPresented).toBe(false);
    expect(onCoverPresented).not.toHaveBeenCalled();

    await act(async () => Promise.resolve());
    expect(onCoverPresented).not.toHaveBeenCalled();

    advanceTwoFrames();
    expect(lifecycle.current.coverPresented).toBe(true);
    expect(onCoverPresented).toHaveBeenCalledTimes(1);
    lifecycle.unmount();
  });

  test('starts the minimum only after the native splash finishes hiding', async () => {
    let finishHiding: (() => void) | undefined;
    mockHideAsync.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishHiding = resolve;
        }),
    );
    const lifecycle = renderLifecycle(true);
    act(() => {
      lifecycle.current.handleCoverLayout();
      lifecycle.current.reportContentReady();
    });
    advanceTwoFrames();

    act(() => jest.advanceTimersByTime(STARTUP_MINIMUM_VISIBLE_MS * 2));
    expect(lifecycle.current.exitRequested).toBe(false);

    await act(async () => {
      finishHiding?.();
      await Promise.resolve();
    });
    act(() => jest.advanceTimersToNextTimer());
    expect(lifecycle.current.exitRequested).toBe(false);

    act(() => jest.advanceTimersToNextTimer());
    act(() => jest.advanceTimersByTime(STARTUP_MINIMUM_VISIBLE_MS - 1));
    expect(lifecycle.current.exitRequested).toBe(false);

    act(() => jest.advanceTimersByTime(1));
    expect(lifecycle.current.exitRequested).toBe(true);
    lifecycle.unmount();
  });

  test('waits for bootstrap, content, cover layout, and the minimum duration', async () => {
    const lifecycle = renderLifecycle(false);
    act(() => {
      lifecycle.current.handleCoverLayout();
      lifecycle.current.reportContentReady();
    });
    expect(lifecycle.current.exitRequested).toBe(false);

    await advanceToCoverPresented();
    lifecycle.rerender(true);
    act(() => jest.advanceTimersByTime(STARTUP_MINIMUM_VISIBLE_MS - 1));
    expect(lifecycle.current.exitRequested).toBe(false);

    act(() => jest.advanceTimersByTime(1));
    expect(lifecycle.current.exitRequested).toBe(true);
    lifecycle.unmount();
  });

  test('warns and exits when content does not report within three seconds of bootstrap', async () => {
    const lifecycle = renderLifecycle(true);
    act(() => lifecycle.current.handleCoverLayout());
    await advanceToCoverPresented();
    act(() => jest.advanceTimersByTime(STARTUP_MINIMUM_VISIBLE_MS));
    expect(lifecycle.current.exitRequested).toBe(false);

    const remainingUntilTimeout = 10_000 + STARTUP_CONTENT_TIMEOUT_MS - Date.now();
    act(() => jest.advanceTimersByTime(remainingUntilTimeout - 1));
    expect(mockWarn).not.toHaveBeenCalled();
    expect(lifecycle.current.exitRequested).toBe(false);

    act(() => jest.advanceTimersByTime(1));
    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(lifecycle.current.exitRequested).toBe(true);
    lifecycle.unmount();
  });

  test('starts the content timeout only after bootstrap becomes ready', () => {
    const lifecycle = renderLifecycle(false);
    act(() => jest.advanceTimersByTime(STARTUP_CONTENT_TIMEOUT_MS));
    expect(mockWarn).not.toHaveBeenCalled();

    lifecycle.rerender(true);
    act(() => jest.advanceTimersByTime(STARTUP_CONTENT_TIMEOUT_MS - 1));
    expect(mockWarn).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(1));
    expect(mockWarn).toHaveBeenCalledTimes(1);
    lifecycle.unmount();
  });

  test('cleans up minimum and fallback timers when unmounted', async () => {
    const lifecycle = renderLifecycle(true);
    act(() => lifecycle.current.handleCoverLayout());
    await advanceToCoverPresented();
    const timerCountBeforeUnmount = jest.getTimerCount();

    lifecycle.unmount();

    expect(jest.getTimerCount()).toBe(timerCountBeforeUnmount - 2);
    act(() => jest.advanceTimersByTime(STARTUP_CONTENT_TIMEOUT_MS));
    expect(mockWarn).not.toHaveBeenCalled();
  });

  test('ignores native splash completion after unmount', async () => {
    let finishHiding: (() => void) | undefined;
    const onCoverPresented = jest.fn();
    mockHideAsync.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishHiding = resolve;
        }),
    );
    const lifecycle = renderLifecycle(false, onCoverPresented);
    act(() => lifecycle.current.handleCoverLayout());
    advanceTwoFrames();

    lifecycle.unmount();
    await act(async () => {
      finishHiding?.();
      await Promise.resolve();
    });

    expect(onCoverPresented).not.toHaveBeenCalled();
  });

  test('cancels pending cover commit frames when unmounted', () => {
    const lifecycle = renderLifecycle(false);
    act(() => lifecycle.current.handleCoverLayout());

    lifecycle.unmount();
    act(() => jest.runOnlyPendingTimers());

    expect(mockHideAsync).not.toHaveBeenCalled();
  });

  test('cancels pending post-hide frames when unmounted', async () => {
    const onCoverPresented = jest.fn();
    const lifecycle = renderLifecycle(false, onCoverPresented);
    act(() => lifecycle.current.handleCoverLayout());
    advanceTwoFrames();
    await act(async () => Promise.resolve());

    lifecycle.unmount();
    act(() => jest.runOnlyPendingTimers());

    expect(mockHideAsync).toHaveBeenCalledTimes(1);
    expect(onCoverPresented).not.toHaveBeenCalled();
  });
});
