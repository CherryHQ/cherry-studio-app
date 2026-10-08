import { REMOTE_READ_CACHE_POLICY } from './remoteReadCachePolicy';

type Flight = { controller: AbortController; users: number; promise: Promise<unknown> };
/** One source-wide RPC budget; deduplicated work has independent consumer cancellation. */
export class RemoteReadCoordinator {
  private readonly flights = new Map<string, Flight>();
  private readonly queue: (() => void)[] = [];
  private running = 0;
  constructor(private readonly limit = REMOTE_READ_CACHE_POLICY.concurrency) {}
  async run<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const start = () => {
        signal.removeEventListener('abort', abort);
        this.running++;
        resolve();
      };
      const abort = () => {
        const index = this.queue.indexOf(start);
        if (index >= 0) this.queue.splice(index, 1);
        reject(signal.reason);
      };
      if (this.running < this.limit) start();
      else {
        this.queue.push(start);
        signal.addEventListener('abort', abort, { once: true });
      }
    });
    try {
      signal.throwIfAborted();
      return await work();
    } finally {
      this.running--;
      this.queue.shift()?.();
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
