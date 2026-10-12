/**
 * `Promise.withResolvers()` compatibility for Hermes.
 *
 * Pi Durable's scheduler, output buffering, and harness utilities call it directly; Hermes builds
 * that predate ES2024 do not provide it. Native implementations are kept.
 */

type PromiseWithResolversConstructor = PromiseConstructor & {
  withResolvers?: <T>() => {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
  };
};

const PromiseConstructor = globalThis.Promise as PromiseWithResolversConstructor;

if (typeof PromiseConstructor.withResolvers !== 'function') {
  Object.defineProperty(PromiseConstructor, 'withResolvers', {
    configurable: true,
    writable: true,
    value: function withResolvers<T>(this: PromiseConstructor) {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new this<T>((settle, fail) => {
        resolve = settle;
        reject = fail;
      });
      return { promise, resolve, reject };
    },
  });
}
