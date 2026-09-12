/**
 * Vocabulary for the resource-scope subsystem.
 *
 * Design: docs/references/lifecycle/resource-scope.md.
 *
 * Deliberately thin on domain meaning. `ScopeKind` is the one place a domain
 * word appears, and only as a namespace for ids.
 */

/** A domain resource that owns cancellable work. */
export type ScopeKind = 'painting';

export type ResourceScope = {
  readonly kind: ScopeKind;
  readonly id: string;
};

/**
 * Why an operation is being cancelled. Handed to `cancel()` verbatim, so it
 * ends up in the operation's own error message and in the job ledger.
 *
 * A plain string rather than a union: the coordinator's own two reasons are
 * below, but a caller passing a more specific one through `MutationOptions`
 * produces a better diagnostic than a coerced enum member would.
 */
export type CancelReason = string;

export const CANCEL_REASON_DELETED: CancelReason = 'resource-deleted';
export const CANCEL_REASON_INVALIDATED: CancelReason = 'resource-invalidated';

export type OperationRegistration = {
  /** Diagnostic identity, e.g. `job.painting.generate`. */
  readonly kind: string;
  /** Every scope this operation belongs to. Any one of them cleans it up, once. */
  readonly scopes: readonly ResourceScope[];
  /**
   * Request termination. Must be idempotent, synchronous, and non-throwing —
   * a throwing canceller is logged and skipped rather than allowed to strand
   * the resource, so throwing only loses you the cancellation.
   *
   * It does not await anything. `settled` is how the coordinator learns the
   * operation actually stopped.
   */
  cancel(reason: CancelReason): void;
  /**
   * Resolves when the operation has stopped *and written its terminal state*.
   * Resolving early is the one thing that breaks the guarantee: the mutation
   * would then race the operation's last write.
   *
   * May reject; the coordinator treats settled-by-rejection as settled and
   * attaches its own handler, so a rejection here is never unhandled.
   */
  readonly settled: Promise<unknown>;
};

export type OperationHandle = {
  /** Idempotent. Must be called on every terminal path, cancellation included. */
  release(): void;
};

/** A live registration, as reported by diagnostics and by drain failures. */
export type ActiveOperation = {
  readonly kind: string;
  readonly scopes: readonly ResourceScope[];
};

export type MutationOptions = {
  /** Ceiling for the drain step. Defaults to {@link DEFAULT_DRAIN_TIMEOUT_MS}. */
  readonly drainTimeoutMs?: number;
  readonly reason?: CancelReason;
};

/**
 * Matches the framework's per-service teardown ceiling. The two bound the same
 * kind of wait — "an aborted operation gets a bounded chance to write one
 * terminal transaction" — so they have no reason to differ.
 */
export const DEFAULT_DRAIN_TIMEOUT_MS = 5000;

/** The scope rejects new registrations: a delete or invalidate pass owns it. */
export class ScopeFencedError extends Error {
  constructor(readonly scope: ResourceScope) {
    super(`Scope ${scope.kind}:${scope.id} is fenced and cannot accept new operations`);
    this.name = 'ScopeFencedError';
  }
}

/** Cancelled operations did not stop within the ceiling, so the mutation never ran. */
export class ScopeDrainTimeoutError extends Error {
  constructor(readonly stragglers: readonly ActiveOperation[]) {
    super(
      `Timed out waiting for ${stragglers.length} operation(s) to stop: ${stragglers
        .map((operation) => operation.kind)
        .join(', ')}`,
    );
    this.name = 'ScopeDrainTimeoutError';
  }
}

export function scopeKey(scope: ResourceScope): string {
  return `${scope.kind}:${scope.id}`;
}
