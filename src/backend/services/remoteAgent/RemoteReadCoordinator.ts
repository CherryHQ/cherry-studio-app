import { type ConcurrencySlots, createConcurrencySlots } from '@/backend/utils/concurrencySlots';

import { REMOTE_READ_CACHE_POLICY } from './remoteReadCachePolicy';

type Flight = { controller: AbortController; users: number; promise: Promise<unknown> };
/** One source-wide RPC budget; deduplicated work has independent consumer cancellation. */
export class RemoteReadCoordinator {
  private readonly flights = new Map<string, Flight>();
  private readonly slots: ConcurrencySlots;
  constructor(limit = REMOTE_READ_CACHE_POLICY.concurrency) {
    this.slots = createConcurrencySlots(limit);
  }
  async run<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    const release = await this.slots.acquire(signal);
    try {
      signal.throwIfAborted();
      return await work();
    } finally {
      release();
    }
  }
  share<T>(
    key: string,
    signal: AbortSignal,
    work: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    signal.throwIfAborted();
    let flight = this.flights.get(key);
    if (!flight) {
      const controller = new AbortController();
      const created: Flight = { controller, users: 0, promise: Promise.resolve() };
      created.promise = Promise.resolve()
        .then(() => {
          controller.signal.throwIfAborted();
          return work(controller.signal);
        })
        .finally(() => {
          if (this.flights.get(key) === created) this.flights.delete(key);
        });
      this.flights.set(key, created);
      flight = created;
    }
    const retained = flight;
    retained.users++;
    return new Promise<T>((resolve, reject) => {
      let done = false;
      const finish = (error: boolean, value: unknown) => {
        if (done) return;
        done = true;
        signal.removeEventListener('abort', abort);
        if (--retained.users === 0) {
          if (this.flights.get(key) === retained) this.flights.delete(key);
          retained.controller.abort();
        }
        if (error) reject(value);
        else resolve(value as T);
      };
      const abort = () => finish(true, signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      retained.promise.then(
        (value) => finish(false, value),
        (error) => finish(true, error),
      );
    });
  }
}
