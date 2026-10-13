let active = false;
const pending: (() => void)[] = [];

/** Queue URLs before downloading so complete HTML cannot accumulate behind QuickJS. */
export function acquireLocalFetchSlot(signal: AbortSignal): Promise<() => void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const start = () => {
      signal.removeEventListener('abort', abort);
      active = true;
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        active = false;
        pending.shift()?.();
      });
    };
    const abort = () => {
      const index = pending.indexOf(start);
      if (index >= 0) pending.splice(index, 1);
      reject(signal.reason);
    };
    if (active) {
      pending.push(start);
      signal.addEventListener('abort', abort, { once: true });
    } else start();
  });
}
