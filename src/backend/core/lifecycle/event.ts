/**
 * Typed events for inter-service communication.
 *
 * Ported verbatim from Cherry Desktop `src/main/core/lifecycle/event.ts`.
 * Producers own an `Emitter<T>` and expose its `Event<T>`; consumers subscribe
 * and receive a `Disposable`.
 *
 * @example
 * // Producer
 * private readonly _onChanged = new Emitter<string>();
 * readonly onChanged: Event<string> = this._onChanged.event;
 *
 * // Consumer
 * this.registerDisposable(service.onChanged((id) => { ... }));
 */

/**
 * A resource with deterministic cleanup.
 *
 * Register one via `BaseService.registerDisposable()` to have it released when
 * the service stops.
 */
export type Disposable = {
  dispose(): void;
};

/**
 * Wrap a cleanup function as a `Disposable`.
 *
 * Bridges APIs that return `() => void` — React Native's
 * `AppState.addEventListener().remove`, preference subscriptions — into the
 * interface `registerDisposable()` expects. Disposal is idempotent.
 */
export function toDisposable(fn: () => void): Disposable {
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      fn();
    },
  };
}

/** Subscribe to a typed event; the returned `Disposable` unsubscribes. */
export type Event<T> = (listener: (e: T) => void) => Disposable;

/**
 * Type-safe event emitter.
 *
 * `fire()` is synchronous and error-isolated: one throwing listener cannot
 * prevent the others from running. A disposed emitter ignores `fire()` and
 * hands back a no-op subscription.
 */
export class Emitter<T> implements Disposable {
  private readonly listeners = new Set<(e: T) => void>();
  private disposed = false;

  readonly event: Event<T> = (listener: (e: T) => void): Disposable => {
    if (this.disposed) {
      return { dispose: () => {} };
    }

    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  };

  /** Notify every current listener. The set is snapshotted, so a listener may subscribe or unsubscribe during delivery. */
  fire(event: T): void {
    if (this.disposed) return;

    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
        // Error isolation: one bad listener must not break the others.
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}
