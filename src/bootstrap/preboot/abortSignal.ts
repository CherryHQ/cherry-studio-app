/**
 * Abort reason and `throwIfAborted` compatibility for React Native.
 *
 * React Native installs the global `AbortSignal` from `abort-controller@3`
 * (see react-native/Libraries/Core/setUpXHR.js), which lacks both APIs, and
 * Expo's winter runtime does not replace it. Host interruption settlement
 * needs the original reason; MCP tool execution needs `throwIfAborted()`.
 */

const signalPrototype = globalThis.AbortSignal?.prototype;

if (signalPrototype && !('reason' in signalPrototype)) {
  const reasons = new WeakMap<AbortSignal, unknown>();
  const abort = globalThis.AbortController.prototype.abort;

  Object.defineProperty(signalPrototype, 'reason', {
    configurable: true,
    enumerable: true,
    get(this: AbortSignal) {
      return reasons.get(this);
    },
  });

  globalThis.AbortController.prototype.abort = function (reason?: unknown) {
    const signal = this.signal;
    if (!signal.aborted) {
      // Listeners run synchronously inside abort(); preserve the first reason
      // before they can settle the task or request cancellation again.
      reasons.set(
        signal,
        reason === undefined
          ? new DOMException('This operation was aborted', 'AbortError')
          : reason,
      );
    }
    abort.call(this);
  };
}

if (signalPrototype && typeof signalPrototype.throwIfAborted !== 'function') {
  Object.defineProperty(signalPrototype, 'throwIfAborted', {
    configurable: true,
    value: function throwIfAborted(this: AbortSignal) {
      if (this.aborted) {
        throw this.reason;
      }
    },
    writable: true,
  });
}
