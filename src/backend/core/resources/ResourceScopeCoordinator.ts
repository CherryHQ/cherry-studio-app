import { loggerService } from '@logger';

import { BaseService, Injectable, Phase, ServicePhase } from '@/backend/core/lifecycle';

import {
  type ActiveOperation,
  CANCEL_REASON_DELETED,
  CANCEL_REASON_INVALIDATED,
  DEFAULT_DRAIN_TIMEOUT_MS,
  type MutationOptions,
  type OperationHandle,
  type OperationRegistration,
  type ResourceScope,
  ScopeDrainTimeoutError,
  ScopeFencedError,
  scopeKey,
} from './types';

const logger = loggerService.withContext('ResourceScopeCoordinator');

type OperationRecord = OperationRegistration & {
  /** Set from `settled`'s own continuation, so a straggler list is never a guess. */
  done: boolean;
  released: boolean;
};

/**
 * Makes deleting a resource stop the work running under it.
 *
 * A painting deleted mid-generation would otherwise leave its job running.
 * Cancellation exists in `JobRuntime`, but coordinating it here makes every
 * caller of the Data API deletion path obey the same drain boundary.
 *
 * It knows no domain vocabulary beyond the scope kinds: it stores registrations
 * and calls back what it was handed. Adding a new kind of cancellable work needs
 * no change here, and it imports no runtime it coordinates — which is also why
 * it can live under `backend/core`, below every layer that has to reach it.
 *
 * `Gate`: it has no initialization, but the Data API can serve a delete the
 * moment the gate opens, and a registry that appears late would silently let the
 * first deletions through uncoordinated.
 */
@Injectable('ResourceScopeCoordinator')
@ServicePhase(Phase.Gate)
export class ResourceScopeCoordinator extends BaseService {
  private readonly operationsByScope = new Map<string, Set<OperationRecord>>();

  /**
   * Depth, not a flag: two passes may overlap on one scope, and the inner one
   * finishing must not unfence the outer one's window.
   */
  private readonly fenceDepth = new Map<string, number>();

  /** Terminal. A sealed scope never accepts work again — the resource is gone. */
  private readonly sealed = new Set<string>();

  /**
   * Claim a scope for the duration of an operation.
   *
   * This is the atomic gate, so there is no "is it fenced?" to check first: a
   * caller registers and handles {@link ScopeFencedError}. Register *before* the
   * first external side effect and release on every terminal path, cancellation
   * included — an operation that starts work before registering is invisible to
   * the pass that is about to delete its scope.
   */
  register(registration: OperationRegistration): OperationHandle {
    // Checked across every target scope before anything is inserted, so a
    // rejected registration leaves no partial index behind.
    for (const scope of registration.scopes) {
      if (this.isFenced(scopeKey(scope))) {
        throw new ScopeFencedError(scope);
      }
    }

    const record: OperationRecord = { ...registration, done: false, released: false };
    for (const scope of registration.scopes) {
      const key = scopeKey(scope);
      const operations = this.operationsByScope.get(key) ?? new Set<OperationRecord>();
      operations.add(record);
      this.operationsByScope.set(key, operations);
    }

    // Doubles as the rejection handler: `settled` belongs to the caller, who may
    // never await it, and an operation that ends by throwing must not surface as
    // an unhandled rejection from having been registered here.
    const markDone = () => {
      record.done = true;
    };
    void registration.settled.then(markDone, markDone);

    return {
      release: () => {
        if (record.released) return;
        record.released = true;
        this.forget(record);
      },
    };
  }

  /**
   * The resource is gone: cancel the work under it, then mutate, then seal the
   * scope forever.
   */
  delete<T>(
    scopes: readonly ResourceScope[],
    mutate: () => Promise<T>,
    options: MutationOptions = {},
  ): Promise<T> {
    return this.run('delete', scopes, mutate, options);
  }

  /**
   * The context under the resource is no longer valid but the resource survives
   * — a deleted message, say. Same sequence; the scope reopens at the end.
   */
  invalidate<T>(
    scopes: readonly ResourceScope[],
    mutate: () => Promise<T>,
    options: MutationOptions = {},
  ): Promise<T> {
    return this.run('invalidate', scopes, mutate, options);
  }

  /**
   * Diagnostics and logging only.
   *
   * Not a pre-flight check: whatever this returns can be stale by the next line,
   * and acting on it would reintroduce the check-then-act race that `register`
   * exists to avoid.
   */
  listActive(scope: ResourceScope): readonly ActiveOperation[] {
    const operations = this.operationsByScope.get(scopeKey(scope));
    return operations ? [...operations].map(toActiveOperation) : [];
  }

  /**
   * Shutdown does not run through here — the host stops each owner in reverse
   * dependency order and each drains its own work. Dropping the index is all
   * that is left, so a release arriving from an aborted operation afterwards
   * finds nothing rather than resurrecting a map entry.
   */
  protected onStop(): void {
    this.operationsByScope.clear();
    this.fenceDepth.clear();
    this.sealed.clear();
  }

  private async run<T>(
    mode: 'delete' | 'invalidate',
    scopes: readonly ResourceScope[],
    mutate: () => Promise<T>,
    options: MutationOptions,
  ): Promise<T> {
    // Deduplicated up front so a batch that names one scope twice — or an
    // operation registered under more than one resource — is fenced once,
    // cancelled once, and drained once.
    const keys = [...new Set(scopes.map(scopeKey))];
    const reason =
      options.reason ?? (mode === 'delete' ? CANCEL_REASON_DELETED : CANCEL_REASON_INVALIDATED);

    for (const key of keys) {
      this.fenceDepth.set(key, (this.fenceDepth.get(key) ?? 0) + 1);
    }

    let mutating = false;
    try {
      const operations = this.collect(keys);
      for (const operation of operations) {
        try {
          operation.cancel(reason);
        } catch (error) {
          // Best effort by contract: a canceller that throws must not be able to
          // strand its resource behind a fence forever.
          logger.error(`cancel() threw for operation '${operation.kind}'`, error as Error);
        }
      }

      const stragglers = await this.drain(operations, options.drainTimeoutMs);
      if (stragglers.length > 0) {
        // The mutation deliberately never runs: work is still writing through
        // this scope, and deleting underneath it is the race being prevented.
        throw new ScopeDrainTimeoutError(stragglers);
      }

      mutating = true;
      const result = await mutate();

      for (const key of keys) {
        this.unfence(key);
        if (mode === 'delete') this.sealed.add(key);
      }
      return result;
    } catch (error) {
      // A failed drain unfences: nothing was written, so the scope is exactly as
      // it was. A failed *delete* mutation does not, because it may have deleted
      // part of a batch — the scope is left claimed and reported rather than
      // reopened over a half-deleted resource.
      if (mode === 'delete' && mutating) {
        logger.error(
          `delete mutation failed; leaving ${keys.length} scope(s) fenced: ${keys.join(', ')}`,
          error as Error,
        );
      } else {
        for (const key of keys) this.unfence(key);
      }
      throw error;
    }
  }

  /** Every operation under any of these scopes, each appearing once. */
  private collect(keys: readonly string[]): OperationRecord[] {
    const seen = new Set<OperationRecord>();
    for (const key of keys) {
      for (const operation of this.operationsByScope.get(key) ?? []) {
        seen.add(operation);
      }
    }
    return [...seen];
  }

  private async drain(
    operations: readonly OperationRecord[],
    timeoutMs = DEFAULT_DRAIN_TIMEOUT_MS,
  ): Promise<ActiveOperation[]> {
    if (operations.length === 0) return [];

    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<'expired'>((resolve) => {
      timer = setTimeout(() => resolve('expired'), timeoutMs);
    });

    try {
      const outcome = await Promise.race([
        Promise.allSettled(operations.map((operation) => operation.settled)).then(
          () => 'settled' as const,
        ),
        expired,
      ]);
      if (outcome === 'settled') return [];
      return operations.filter((operation) => !operation.done).map(toActiveOperation);
    } finally {
      // Always cleared: a pending timer would outlive the pass and, under fake
      // timers, outlive the test that started it.
      clearTimeout(timer);
    }
  }

  private isFenced(key: string): boolean {
    return this.sealed.has(key) || (this.fenceDepth.get(key) ?? 0) > 0;
  }

  private unfence(key: string): void {
    const depth = (this.fenceDepth.get(key) ?? 0) - 1;
    if (depth > 0) {
      this.fenceDepth.set(key, depth);
    } else {
      this.fenceDepth.delete(key);
    }
  }

  private forget(record: OperationRecord): void {
    for (const scope of record.scopes) {
      const key = scopeKey(scope);
      const operations = this.operationsByScope.get(key);
      if (!operations) continue;
      operations.delete(record);
      if (operations.size === 0) this.operationsByScope.delete(key);
    }
  }
}

function toActiveOperation(record: OperationRecord): ActiveOperation {
  return { kind: record.kind, scopes: record.scopes };
}
