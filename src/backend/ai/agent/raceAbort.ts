/**
 * Consumer-side cancellation: release the caller's wait when the signal aborts.
 *
 * The underlying work is NOT cancelled here — the abort is expected to reach it
 * through its own signal wiring — so a hung or frozen operation can no longer
 * pin the caller. The loser is consumed after the race settles, so its late
 * rejection never surfaces as an unhandled rejection, and the abort listener is
 * removed either way so long-lived signals do not accumulate one closure per
 * call.
 */
export function raceAbort<T>(operation: Promise<T> | T, signal: AbortSignal): Promise<T> {
  const settled = Promise.resolve(operation);
  if (signal.aborted) {
    settled.catch(() => undefined);
    return Promise.reject(abortReason(signal));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    // Attaching both handlers also consumes the loser's late rejection.
    settled.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
}

/**
 * Wait for an operation to settle, but never longer than the grace window.
 * Used where the caller itself initiated the abort and only wants to give the
 * underlying loop a bounded chance to unwind before it settles the outcome.
 */
export async function settleWithin(
  operation: Promise<unknown> | undefined,
  graceMs: number,
): Promise<void> {
  if (!operation) return;
  let handle: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      operation.catch(() => undefined),
      new Promise<void>((resolve) => {
        handle = setTimeout(resolve, graceMs);
      }),
    ]);
  } finally {
    if (handle !== undefined) clearTimeout(handle);
  }
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('The operation was aborted.');
}
