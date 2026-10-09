export type LinkedAbortSignal = {
  /** Aborts with the reason of the first source that aborts. */
  readonly signal: AbortSignal;
  /** Detach from every source; the linked signal keeps its current state. */
  dispose(): void;
};

/**
 * Scoped `AbortSignal.any`. Expo's polyfill detaches from its sources only when one aborts, so a
 * long-lived source gains one listener per call; dispose when the linked operation settles.
 */
export function linkAbortSignals(sources: readonly AbortSignal[]): LinkedAbortSignal {
  const controller = new AbortController();
  const aborted = sources.find((source) => source.aborted);
  if (aborted) {
    controller.abort(aborted.reason);
    return { signal: controller.signal, dispose() {} };
  }
  const listeners = sources.map((source) => {
    const onAbort = () => {
      dispose();
      controller.abort(source.reason);
    };
    source.addEventListener('abort', onAbort);
    return () => source.removeEventListener('abort', onAbort);
  });
  function dispose() {
    for (const remove of listeners.splice(0)) remove();
  }
  return { signal: controller.signal, dispose };
}
