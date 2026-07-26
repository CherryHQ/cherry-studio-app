/**
 * `AbortSignal.prototype.throwIfAborted` polyfill.
 *
 * React Native installs the global `AbortSignal` from `abort-controller@3`
 * (see react-native/Libraries/Core/setUpXHR.js), which predates this method,
 * and Expo's winter runtime does not replace it. `@ai-sdk/mcp` calls
 * `signal.throwIfAborted()` at the top of every tool execution, so without this
 * every MCP tool call fails with "undefined is not a function".
 */

const signalPrototype = globalThis.AbortSignal?.prototype;

if (signalPrototype && typeof signalPrototype.throwIfAborted !== 'function') {
  Object.defineProperty(signalPrototype, 'throwIfAborted', {
    configurable: true,
    value: function throwIfAborted(this: AbortSignal) {
      if (this.aborted) {
        // `abort-controller@3` has no `reason` either — synthesize the value the
        // spec assigns when `abort()` is called without one.
        throw this.reason ?? new DOMException('This operation was aborted', 'AbortError');
      }
    },
    writable: true,
  });
}
