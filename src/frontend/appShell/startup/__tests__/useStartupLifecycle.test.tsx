import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { STARTUP_CONTENT_TIMEOUT_MS } from '../startupState';
import { useStartupLifecycle } from '../useStartupLifecycle';

const mockHideAsync = jest.fn(async (): Promise<void> => undefined);
const mockWarn = jest.fn();
const mockInfo = jest.fn();

jest.mock('expo-splash-screen', () => ({
  hideAsync: () => mockHideAsync(),
}));

jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: {
    withContext: () => ({
      warn: (...args: unknown[]) => mockWarn(...args),
      info: (...args: unknown[]) => mockInfo(...args),
    }),
  },
}));

type Lifecycle = ReturnType<typeof useStartupLifecycle>;

function renderLifecycle(bootstrapReady: boolean) {
  let current: Lifecycle | undefined;
  let renderer: ReactTestRenderer | undefined;

  function Probe({ ready }: { ready: boolean }) {
    current = useStartupLifecycle(ready);
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

describe('useStartupLifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(10_000);
    mockHideAsync.mockReset();
    mockHideAsync.mockResolvedValue(undefined);
    mockWarn.mockClear();
    mockInfo.mockClear();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('does not hide the native splash before both bootstrap and initial content are ready', () => {
    const waitingBootstrap = renderLifecycle(false);
    act(() => waitingBootstrap.current.reportContentReady());
    expect(mockHideAsync).not.toHaveBeenCalled();
    expect(waitingBootstrap.current.coverVisible).toBe(true);
    waitingBootstrap.unmount();

    const waitingContent = renderLifecycle(true);
    expect(mockHideAsync).not.toHaveBeenCalled();
    expect(waitingContent.current.coverVisible).toBe(true);
    waitingContent.unmount();
  });

  test('hides the native splash once ready and clears coverVisible after hideAsync settles', async () => {
    let finishHiding: (() => void) | undefined;
    mockHideAsync.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishHiding = resolve;
        }),
    );

    const lifecycle = renderLifecycle(false);
    act(() => lifecycle.current.reportContentReady());
    expect(mockHideAsync).not.toHaveBeenCalled();

    lifecycle.rerender(true);
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
    expect(lifecycle.current.coverVisible).toBe(true);

    // Repeated readiness reports or bootstrap toggles do not trigger a second hide.
    act(() => lifecycle.current.reportContentReady());
    lifecycle.rerender(false);
    lifecycle.rerender(true);
    expect(mockHideAsync).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishHiding?.();
      await Promise.resolve();
    });
    expect(lifecycle.current.coverVisible).toBe(false);
    lifecycle.unmount();
  });

  test('starts the content timeout only after bootstrap becomes ready, warns, and hides splash on timeout', async () => {
    const lifecycle = renderLifecycle(false);
    act(() => jest.advanceTimersByTime(STARTUP_CONTENT_TIMEOUT_MS));
    expect(mockWarn).not.toHaveBeenCalled();
    expect(mockHideAsync).not.toHaveBeenCalled();

    lifecycle.rerender(true);
    act(() => jest.advanceTimersByTime(STARTUP_CONTENT_TIMEOUT_MS - 1));
    expect(mockWarn).not.toHaveBeenCalled();
    expect(mockHideAsync).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(1));
    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn).toHaveBeenCalledWith(
      'Initial content did not report readiness before the startup timeout',
      { operation: 'startup.content.timeout' },
    );
    expect(mockHideAsync).toHaveBeenCalledTimes(1);

    await act(async () => Promise.resolve());
    expect(lifecycle.current.coverVisible).toBe(false);
    lifecycle.unmount();
  });

  test('records content and splash milestones in startup order without repeating content readiness', async () => {
    const lifecycle = renderLifecycle(false);
    lifecycle.rerender(true);
    act(() => {
      lifecycle.current.reportContentReady();
      lifecycle.current.reportContentReady();
    });
    await act(async () => Promise.resolve());

    expect(mockInfo.mock.calls.map(([, facts]) => facts.operation)).toEqual([
      'startup.content.ready',
      'startup.splash.hidden',
    ]);
    lifecycle.unmount();
  });

  test('cleans up the fallback timer when unmounted', () => {
    const lifecycle = renderLifecycle(true);
    const timerCountBeforeUnmount = jest.getTimerCount();

    lifecycle.unmount();

    expect(jest.getTimerCount()).toBe(timerCountBeforeUnmount - 1);
    act(() => jest.advanceTimersByTime(STARTUP_CONTENT_TIMEOUT_MS));
    expect(mockWarn).not.toHaveBeenCalled();
    expect(mockHideAsync).not.toHaveBeenCalled();
  });

  test('ignores native splash completion after unmount', async () => {
    let finishHiding: (() => void) | undefined;
    mockHideAsync.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishHiding = resolve;
        }),
    );

    const lifecycle = renderLifecycle(true);
    act(() => lifecycle.current.reportContentReady());
    expect(mockHideAsync).toHaveBeenCalledTimes(1);

    lifecycle.unmount();
    await act(async () => {
      finishHiding?.();
      await Promise.resolve();
    });

    expect(mockInfo.mock.calls.map(([, facts]) => facts.operation)).toEqual([
      'startup.content.ready',
    ]);
  });
});
