import { installAbortSignalPatch } from 'expo/src/winter/AbortSignal';

/**
 * Run with Expo's AbortSignal.any/timeout polyfills, which the app uses on Hermes, and record the
 * abort listeners and timers still attached. Restore with jest.restoreAllMocks().
 */
export function trackExpoAbortSignals() {
  const expo = installAbortSignalPatch({} as typeof AbortSignal);
  jest.spyOn(AbortSignal, 'any').mockImplementation(expo.any);
  jest.spyOn(AbortSignal, 'timeout').mockImplementation(expo.timeout);
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
