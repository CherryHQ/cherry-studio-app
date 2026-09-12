import type { JobRow } from '@/backend/data/db/schemas/job';
/**
 * Startup recovery: reconcile non-terminal leftovers with the freshly booted
 * runtime, per handler recovery strategy.
 *
 * Keep aligned with desktop src/main/core/job/runtime/recovery.ts. Mobile
 * shape diff: the desktop version calls a synchronous module-singleton
 * jobService; here the repository is injected and async so the pure algorithm
 * stays test-friendly and free of platform imports.
 *
 * Each repository call serializes through `DbService.withWriteTx` internally.
 * Recovery is restartable — there is no cross-call atomicity requirement: a
 * crash mid-recovery just leaves rows for the next cold start to finish.
 */
import { JOB_ERROR_CODES, type JobError } from '@/shared/data/api/schemas/jobs';

import type { JobHandler } from '../types';

export type RecoveryJobRow = Pick<JobRow, 'cancelRequested' | 'id' | 'status' | 'type'>;

export type RecoveryRepo = {
  /** Non-terminal rows of one type, newest first (createdAt DESC, id DESC). */
  getActiveByType(type: string): Promise<RecoveryJobRow[]>;
  /** Every non-terminal row regardless of type (orphan sweep). */
  getStaleActive(): Promise<RecoveryJobRow[]>;
  cancelByIds(ids: readonly string[], error: JobError): Promise<void>;
  resetToPendingByIds(ids: readonly string[]): Promise<void>;
};

export interface RecoveryStats {
  cancelled: number;
  pendingReset: number;
  delayedKept: number;
  singletonKept: number;
}

const cancelledByRecovery: JobError = {
  code: JOB_ERROR_CODES.CANCELLED,
  message: 'Cancelled by startup recovery',
  retryable: false,
};

const orphanCancelled: JobError = {
  code: JOB_ERROR_CODES.CANCELLED,
  message: 'Orphan job: handler no longer registered',
  retryable: false,
};

export async function runStartupRecovery(
  repo: RecoveryRepo,
  handlers: ReadonlyMap<string, JobHandler>,
  isJobInFlight: (jobId: string) => boolean,
): Promise<RecoveryStats> {
  const stats: RecoveryStats = { cancelled: 0, delayedKept: 0, pendingReset: 0, singletonKept: 0 };

  for (const [type, handler] of handlers) {
    // Rows the current runtime is already executing are excluded before the
    // cancelRequested override and every strategy — a job claimed before
    // recovery ran must be neither reset nor cancelled mid-flight.
    const active = (await repo.getActiveByType(type)).filter((row) => !isJobInFlight(row.id));
    if (active.length === 0) continue;

    // Step 1: a persisted cancel intent overrides every strategy.
    const overrideIds = active.filter((row) => row.cancelRequested).map((row) => row.id);
    if (overrideIds.length > 0) {
      await repo.cancelByIds(overrideIds, cancelledByRecovery);
      stats.cancelled += overrideIds.length;
    }
    const remaining = active.filter((row) => !row.cancelRequested);
    if (remaining.length === 0) continue;

    // Step 2: per-handler strategy.
    if (handler.recovery === 'abandon') {
      await repo.cancelByIds(
        remaining.map((row) => row.id),
        cancelledByRecovery,
      );
      stats.cancelled += remaining.length;
    } else if (handler.recovery === 'retry') {
      const runningIds = remaining.filter((row) => row.status === 'running').map((row) => row.id);
      if (runningIds.length > 0) {
        await repo.resetToPendingByIds(runningIds);
        stats.pendingReset += runningIds.length;
      }
      stats.delayedKept += remaining.filter((row) => row.status === 'delayed').length;
    } else {
      // singleton: keep the newest row (list is newest-first), cancel the rest.
      const [keep, ...rest] = remaining;
      if (keep.status === 'running') {
        await repo.resetToPendingByIds([keep.id]);
        stats.pendingReset += 1;
      }
      stats.singletonKept += 1;
      if (rest.length > 0) {
        await repo.cancelByIds(
          rest.map((row) => row.id),
          cancelledByRecovery,
        );
        stats.cancelled += rest.length;
      }
    }
  }

  // Step 3: orphan sweep — types with no registered handler (e.g. removed in
  // an app update) cannot ever run again; cancel them across every status.
  const allActive = await repo.getStaleActive();
  const orphanIds = allActive
    .filter((row) => !handlers.has(row.type) && !isJobInFlight(row.id))
    .map((row) => row.id);
  if (orphanIds.length > 0) {
    await repo.cancelByIds(orphanIds, orphanCancelled);
    stats.cancelled += orphanIds.length;
  }

  return stats;
}
