import { type ConcurrencySlots, createConcurrencySlots } from '@/backend/utils/concurrencySlots';

import { REMOTE_READ_CACHE_POLICY } from './remoteReadCachePolicy';

export type TransferState = {
  transferId: string;
  state: 'downloading' | 'paused' | 'verifying' | 'completed' | 'failed';
  transferredBytes: number;
  totalBytes: number;
  progress: number;
  cancel: () => void;
  retry: () => void;
};

type Flight = { controller: AbortController; users: number; promise: Promise<unknown> };
/** One source-wide RPC budget; deduplicated work has independent consumer cancellation. */
export class RemoteReadCoordinator {
  private readonly flights = new Map<string, Flight>();
  private readonly slots: ConcurrencySlots;
  private readonly transfers = new Map<string, TransferState>();
  private readonly transferListeners = new Map<string, Set<(state: TransferState) => void>>();

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

  getTransferState(transferId: string): TransferState | undefined {
    return this.transfers.get(transferId);
  }

  updateTransferState(transferId: string, updates: Partial<TransferState>): void {
    const existing = this.transfers.get(transferId);
    const totalBytes = updates.totalBytes ?? existing?.totalBytes ?? 0;
    const transferredBytes = updates.transferredBytes ?? existing?.transferredBytes ?? 0;
    const progress = totalBytes > 0 ? Math.min(1, Math.max(0, transferredBytes / totalBytes)) : 0;
    const updated: TransferState = {
      transferId,
      state: updates.state ?? existing?.state ?? 'downloading',
      transferredBytes,
      totalBytes,
      progress: updates.progress ?? progress,
      cancel: updates.cancel ?? existing?.cancel ?? (() => {}),
      retry: updates.retry ?? existing?.retry ?? (() => {}),
    };
    this.transfers.set(transferId, updated);
    const listeners = this.transferListeners.get(transferId);
    if (listeners) {
      for (const listener of listeners) listener(updated);
    }
  }

  subscribeTransfer(transferId: string, callback: (state: TransferState) => void): () => void {
    let listeners = this.transferListeners.get(transferId);
    if (!listeners) {
      listeners = new Set();
      this.transferListeners.set(transferId, listeners);
    }
    listeners.add(callback);
    const current = this.transfers.get(transferId);
    if (current) callback(current);
    return () => {
      listeners?.delete(callback);
      if (listeners && listeners.size === 0) {
        this.transferListeners.delete(transferId);
      }
    };
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
