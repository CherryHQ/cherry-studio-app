export type ConcurrencySlots = {
  /**
   * Waits in FIFO order for a free slot. Rejects with the signal's reason when it is aborted before
   * or while queued, leaving the queue. The returned release is idempotent.
   */
  acquire(signal: AbortSignal): Promise<() => void>;
};

/** A cancellable FIFO limit on how many holders run at once. */
export function createConcurrencySlots(limit: number): ConcurrencySlots {
  const pending: (() => void)[] = [];
  let active = 0;
  return {
    acquire(signal) {
      signal.throwIfAborted();
      return new Promise((resolve, reject) => {
        const start = () => {
          signal.removeEventListener('abort', abort);
          active++;
          let released = false;
          resolve(() => {
            if (released) return;
            released = true;
            active--;
            pending.shift()?.();
          });
        };
        const abort = () => {
          const index = pending.indexOf(start);
          if (index >= 0) pending.splice(index, 1);
          reject(signal.reason);
        };
        if (active < limit) start();
        else {
          pending.push(start);
          signal.addEventListener('abort', abort, { once: true });
        }
      });
    },
  };
}
