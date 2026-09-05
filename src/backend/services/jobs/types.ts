/**
 * Job runtime handler contract and constants.
 *
 * Keep aligned with desktop src/main/core/job/types.ts (and the constants
 * block of src/main/core/job/JobManager.ts). Mobile diffs are deliberate and
 * called out inline: `executionClass` on the handler, a global concurrency
 * default of 2 instead of 50, and no schedule/miss types without a current
 * mobile consumer.
 *
 * These runtime types stay app-side on purpose: the universal jobs schema
 * mirrors desktop src/shared (renderer-visible DTOs only) and must not grow
 * runtime-only types.
 */
import type { LoggerService } from '@logger';

import type { ResourceScope } from '@/backend/core/resources/types';
import type { JobError, JobSnapshot, JobStatus, RetryPolicy } from '@/shared/data/api/schemas/jobs';

import type { JobPayloadOf, JobType } from './jobRegistry';

/**
 * What guarantee a handler's work actually requires from the OS execution
 * window. Mobile-only (desktop always has a live process). The pump
 * dispatches `foreground-only` and `user-continued` (the latter wrapped in a
 * KeepAliveCoordinator lease so it survives backgrounding); other classes
 * stay claimable-in-principle but are filtered out of the pump window until
 * their platform adapters exist. `server-required` is intentionally not a
 * class — such work must never be enqueued locally.
 */
export type JobExecutionClass =
  | 'foreground-only'
  | 'bounded-background'
  | 'user-continued'
  | 'system-transfer';

/**
 * How startup recovery treats this handler's non-terminal leftovers:
 * - `abandon`: every non-terminal row is cancelled.
 * - `retry`: running rows reset to pending (attempt unchanged); delayed kept.
 * - `singleton`: keep the newest non-terminal row, cancel the rest.
 * A persisted `cancelRequested=true` overrides every strategy.
 */
export type RecoveryStrategy = 'abandon' | 'retry' | 'singleton';

export interface JobContext<TPayload = unknown> {
  jobId: string;
  input: TPayload;
  attempt: number;
  /** Row-level parent linkage (`opts.parentId` at enqueue); null for root jobs. */
  parentId: string | null;
  /** Combined abort of: user cancel, handler timeout, runtime dispose. */
  signal: AbortSignal;
  /** Metadata snapshot at attempt start. */
  metadata: Readonly<Record<string, unknown>>;
  /**
   * Shallow-merge + persist metadata. Await it before depending on the value
   * surviving a restart (provider task IDs, cursors — the checkpoint channel).
   */
  patchMetadata(patch: Record<string, unknown>): Promise<void>;
  /** Progress 0-100. No-op until a progress consumer exists. */
  reportProgress(progress: number, detail?: unknown): void;
  /** Pre-bound to `{ jobId, type }`. */
  logger: LoggerService;
}

export interface JobSettledEvent<TPayload = unknown> {
  jobId: string;
  type: string;
  parentId: string | null;
  status: Extract<JobStatus, 'completed' | 'failed' | 'cancelled'>;
  readonly input: TPayload;
  output?: unknown;
  error: JobError | null;
  attempt: number;
  /** Final value — includes every `patchMetadata` merge. */
  metadata: Readonly<Record<string, unknown>>;
}

export interface JobHandler<TPayload = unknown> {
  /** Mobile-only: which execution window may run this job. */
  executionClass: JobExecutionClass;
  recovery: RecoveryStrategy;
  /** Defaults to the job type string. */
  defaultQueue?: (input: TPayload) => string;
  /** Concurrent handlers per queue. Defaults to 1. */
  defaultConcurrency?: number;
  defaultRetryPolicy?: RetryPolicy;
  defaultTimeoutMs?: number;
  /** Grace after cancel before the row is force-finalized. Defaults to 30 s. */
  cancelTimeoutMs?: number;
  /**
   * Which domain resources this job's work belongs to, derived from its input.
   *
   * Mobile-only, and the whole reason the runtime can be cancelled by a
   * deletion: declaring it makes the runtime register each execution with
   * `ResourceScopeCoordinator`, so deleting the resource cancels the job and
   * waits for its terminal row before the delete transaction opens. A handler
   * that omits it runs uncoordinated, which is correct for work owned by
   * nothing deletable.
   *
   * Called with the persisted input, so it must be pure and total — a throw
   * here would fail an execution that was otherwise ready to run.
   *
   * TOMBSTONE: before registering the first scoped handler with
   * `recovery: 'retry'`, persist scope-cancellation intent. Scope cancellation
   * currently aborts synchronously without setting `cancelRequested`; after a
   * process death, retry recovery could otherwise revive work for a resource
   * whose deletion or invalidation initiated that cancellation.
   */
  scopes?(input: TPayload): readonly ResourceScope[];
  /** Throw to fail; reject with the abort reason to cancel. */
  execute(ctx: JobContext<TPayload>): Promise<unknown>;
  // NOTE: keep onSettled as a method-shorthand signature. Method syntax stays
  // bivariant under strictFunctionTypes, so JobHandler<Payload> remains
  // assignable to the type-erased JobHandler the runtime stores. A property
  // arrow signature would reject that assignment. (Desktop-verbatim note.)
  /** Fires once on terminal state. Errors are caught and logged, never thrown. */
  onSettled?(event: JobSettledEvent<TPayload>): void | Promise<void>;
}

export type JobHandlerFor<K extends JobType> = JobHandler<JobPayloadOf<K>>;

export interface JobHandle {
  id: string;
  snapshot: JobSnapshot;
  /**
   * Resolves with the terminal snapshot; never rejects — failure and
   * cancellation are expressed through `snapshot.status`. Never settles across
   * a process death or after `dispose()` (resolvers are dropped, not
   * rejected); observe the ledger via Data API to survive restarts.
   */
  finished: Promise<JobSnapshot>;
}

/**
 * - `cancelled`: the job reached a terminal state within the grace window.
 * - `timed-out`: the handler ignored the signal past `cancelTimeoutMs`; the
 *   row was force-finalized while the handler may still run in memory.
 * - `not-cancellable`: already terminal or unknown.
 */
export type JobCancelOutcome = 'cancelled' | 'timed-out' | 'not-cancellable';

export interface JobCancelResult {
  outcome: JobCancelOutcome;
}

export interface EnqueueOptions {
  queue?: string;
  priority?: number;
  idempotencyKey?: string;
  /** Unix ms; future values enqueue as `delayed`. Defaults to now. */
  scheduledAt?: number;
  parentId?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  metadata?: Record<string, unknown>;
}

export type PumpReason = 'cold-start' | 'app-active' | 'enqueue' | 'settle' | 'timer' | 'manual';

export interface PumpRequest {
  reason: PumpReason;
}

export interface PumpResult {
  claimed: number;
}

// ---------------------------------------------------------------------------
// Constants (desktop values unless noted)
// ---------------------------------------------------------------------------

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  backoff: 'exponential',
  baseDelayMs: 1000,
  maxAttempts: 3,
  maxDelayMs: 60_000,
};

export const DEFAULT_CANCEL_TIMEOUT_MS = 30_000;

export const MAX_INPUT_BYTES = 1_048_576; // 1MB

export const MAX_CANCEL_REASON_CHARS = 500;

/** Mobile-only value: backend JS shares the UI Hermes thread (desktop uses 50). */
export const DEFAULT_GLOBAL_MAX_CONCURRENCY = 2;

export const GC_TERMINAL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7d

export const GC_KEEP_PER_TYPE = 100;
