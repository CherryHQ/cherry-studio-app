/**
 * Run with React Native's AbortSignal.any/timeout, which the app uses on Hermes, and record the
 * abort listeners and timers still attached. Restore with jest.restoreAllMocks().
 *
 * React Native's own implementation only accepts its own AbortSignal class, so this mirrors
 * `react-native/src/private/webapis/dom/abort-api/AbortSignal.js` on Node's signals: `any` keeps
 * its source listeners until a source aborts, and `timeout` keeps its timer until it fires.
 */
export function trackNativeAbortSignals() {
  jest.spyOn(AbortSignal, 'any').mockImplementation((signals) => {
    const aborted = signals.find((signal) => signal.aborted);
    if (aborted) return AbortSignal.abort(aborted.reason);
    const controller = new AbortController();
    const listeners: (() => void)[] = [];
    const cleanup = () => listeners.forEach((unsubscribe) => unsubscribe());
    for (const signal of signals) {
      const onAbort = () => {
        controller.abort(signal.reason);
        cleanup();
      };
      signal.addEventListener('abort', onAbort);
      listeners.push(() => signal.removeEventListener('abort', onAbort));
    }
    return controller.signal;
  });
  jest.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
    const controller = new AbortController();
    setTimeout(
      () => controller.abort(new DOMException('signal timed out', 'TimeoutError')),
      milliseconds,
    );
    return controller.signal;
  });
  const listeners = new Set<unknown>();
  const timers = new Set<unknown>();
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  jest
    .spyOn(EventTarget.prototype, 'addEventListener')
    .mockImplementation(function (this: EventTarget, type, listener, options) {
      if (type === 'abort') listeners.add(listener);
      add.call(this, type, listener, options);
    });
  jest
    .spyOn(EventTarget.prototype, 'removeEventListener')
    .mockImplementation(function (this: EventTarget, type, listener, options) {
      listeners.delete(listener);
      remove.call(this, type, listener, options);
    });
  const set = globalThis.setTimeout;
  const clear = globalThis.clearTimeout;
  jest.spyOn(globalThis, 'setTimeout').mockImplementation(((
    handler: () => void,
    delay?: number,
  ) => {
    const timer = set(() => {
      timers.delete(timer);
      handler();
    }, delay);
    timers.add(timer);
    return timer;
  }) as typeof setTimeout);
  jest.spyOn(globalThis, 'clearTimeout').mockImplementation((timer) => {
    timers.delete(timer);
    clear(timer);
  });
  return { listeners, timers };
}
