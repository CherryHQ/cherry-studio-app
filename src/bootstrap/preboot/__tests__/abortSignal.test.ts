import { createRequire } from 'node:module';

// Resolve React Native's own dependency instead of inheriting Node's newer API.
const legacyAbortPath = createRequire(require.resolve('react-native/package.json')).resolve(
  'abort-controller/dist/abort-controller',
);
const originalAbortSignal = globalThis.AbortSignal;
const originalAbortController = globalThis.AbortController;

beforeEach(() => {
  jest.isolateModules(() => {
    const legacy = jest.requireActual(legacyAbortPath);
    globalThis.AbortSignal = legacy.AbortSignal;
    globalThis.AbortController = legacy.AbortController;
    jest.requireActual('../abortSignal');
  });
});

afterEach(() => {
  globalThis.AbortSignal = originalAbortSignal;
  globalThis.AbortController = originalAbortController;
});

describe('AbortSignal compatibility', () => {
  it('has no reason and does not throw before cancellation', () => {
    const controller = new globalThis.AbortController();
    expect(controller.signal.reason).toBeUndefined();
    expect(() => controller.signal.throwIfAborted()).not.toThrow();
  });

  it.each([new Error('System interruption'), 'cancelled', null, false, 0])(
    'preserves the exact reason %p before abort listeners run',
    (reason) => {
      const controller = new globalThis.AbortController();
      const observed: unknown[] = [];
      controller.signal.addEventListener('abort', () => {
        observed.push(controller.signal.reason);
      });

      controller.abort(reason);

      expect(controller.signal.aborted).toBe(true);
      expect(observed).toEqual([reason]);
      expect(controller.signal.reason).toBe(reason);
      let thrown: unknown = Symbol('not thrown');
      try {
        controller.signal.throwIfAborted();
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBe(reason);
    },
  );

  it('creates one default AbortError and keeps it across repeated aborts', () => {
    const controller = new globalThis.AbortController();
    controller.abort();
    const reason = controller.signal.reason;

    controller.abort(new Error('Later cancellation'));

    expect(reason).toBeInstanceOf(DOMException);
    expect(reason.name).toBe('AbortError');
    expect(controller.signal.reason).toBe(reason);
    expect(() => controller.signal.throwIfAborted()).toThrow(reason);
  });

  it('keeps the first explicit reason when cancellation is repeated or reentrant', () => {
    const controller = new globalThis.AbortController();
    const reason = new Error('System interruption');
    const listener = jest.fn(() => controller.abort(new Error('User cancellation')));
    controller.signal.addEventListener('abort', listener);

    controller.abort(reason);
    controller.abort();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(controller.signal.reason).toBe(reason);
  });

  it('keeps reasons isolated between controllers and across repeated setup', () => {
    const first = new globalThis.AbortController();
    const second = new globalThis.AbortController();
    const reason = new Error('First task interrupted');
    first.abort(reason);
    const abort = globalThis.AbortController.prototype.abort;

    jest.isolateModules(() => {
      jest.requireActual('../abortSignal');
    });

    expect(globalThis.AbortController.prototype.abort).toBe(abort);
    expect(first.signal.reason).toBe(reason);
    expect(second.signal.reason).toBeUndefined();
    second.abort(null);
    expect(second.signal.reason).toBeNull();
    expect(first.signal.reason).toBe(reason);
  });

  it('leaves a spec-compliant implementation alone', () => {
    globalThis.AbortSignal = originalAbortSignal;
    globalThis.AbortController = originalAbortController;
    const abort = originalAbortController.prototype.abort;
    const throwIfAborted = originalAbortSignal.prototype.throwIfAborted;
    const reason = Object.getOwnPropertyDescriptor(originalAbortSignal.prototype, 'reason');

    jest.isolateModules(() => {
      jest.requireActual('../abortSignal');
    });

    expect(originalAbortController.prototype.abort).toBe(abort);
    expect(originalAbortSignal.prototype.throwIfAborted).toBe(throwIfAborted);
    expect(Object.getOwnPropertyDescriptor(originalAbortSignal.prototype, 'reason')).toEqual(
      reason,
    );
  });
});
