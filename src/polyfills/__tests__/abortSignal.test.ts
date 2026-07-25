/**
 * Emulates React Native's `abort-controller@3` global, which ships neither
 * `throwIfAborted` nor `reason`, then loads the polyfill onto it.
 */

class LegacyAbortSignal {
  aborted = false;
}

class LegacyAbortController {
  readonly signal = new LegacyAbortSignal();

  abort() {
    this.signal.aborted = true;
  }
}

const originalAbortSignal = globalThis.AbortSignal;
const originalAbortController = globalThis.AbortController;

beforeAll(() => {
  globalThis.AbortSignal = LegacyAbortSignal as unknown as typeof AbortSignal;
  globalThis.AbortController = LegacyAbortController as unknown as typeof AbortController;
  jest.isolateModules(() => {
    // The polyfill only acts at import time, so re-evaluating it needs a
    // require inside the isolated registry — an ESM import would be hoisted
    // out of the fake-global window this test sets up.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../abortSignal');
  });
});

afterAll(() => {
  globalThis.AbortSignal = originalAbortSignal;
  globalThis.AbortController = originalAbortController;
});

describe('AbortSignal.throwIfAborted polyfill', () => {
  it('installs the method the legacy polyfill lacks', () => {
    expect(typeof globalThis.AbortSignal.prototype.throwIfAborted).toBe('function');
  });

  it('is a no-op while the signal is not aborted', () => {
    const controller = new globalThis.AbortController();
    expect(() => controller.signal.throwIfAborted()).not.toThrow();
  });

  it('throws an AbortError once aborted, even with no reason property', () => {
    const controller = new globalThis.AbortController();
    controller.abort();

    expect(() => controller.signal.throwIfAborted()).toThrow(
      expect.objectContaining({ name: 'AbortError' }),
    );
  });

  it('leaves a spec-compliant implementation alone', () => {
    const native = function throwIfAborted() {};
    const withNative = { prototype: { throwIfAborted: native } };
    globalThis.AbortSignal = withNative as unknown as typeof AbortSignal;

    jest.isolateModules(() => {
      require('../abortSignal');
    });

    expect(globalThis.AbortSignal.prototype.throwIfAborted).toBe(native);
    globalThis.AbortSignal = LegacyAbortSignal as unknown as typeof AbortSignal;
  });
});
