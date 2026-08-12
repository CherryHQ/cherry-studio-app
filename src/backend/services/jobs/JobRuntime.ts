import {
  isTerminalStatus,
  JOB_ERROR_CODES,
  type JobError,
  type JobProgress,
  type JobSnapshot,
  type JobStatus,
} from '@cherrystudio/universal/data/api/schemas/jobs';
/**
 * App-owned job orchestrator: durable enqueue, atomic claim, bounded dispatch,
 * retry backoff, cooperative cancellation, startup recovery, and GC over the
 * `job` ledger.
 *
 * Keep aligned with desktop src/main/core/job/JobManager.ts for domain
 * semantics (validation, error classification, finalize side-effect order,
 * cancel flow, recovery). The runtime shell is mobile-specific by design:
 *
 * - One coalescing pump replaces the per-queue DispatchQueue/mutex fleet —
 *   `DbService.withWriteTx` already serializes every write transaction and
 *   mobile throughput is orders of magnitude below desktop's.
 * - No 60 s quiet window: the handler registry is frozen at construction, and
 *   recovery runs lazily once before the first claim of this runtime.
 * - Claims are fenced by conditional UPDATEs (`WHERE status='running'`, the
 *   "weak fence"): within a single JS runtime and cold-start-only recovery, a
 *   stale attempt cannot outlive its process; run-token fencing arrives with
 *   the Phase 2 background windows (see docs/references/job-manager-design.md).
 * - Delayed promotion rides one foreground timer plus every pump — timers are
 *   a latency optimization, never a correctness mechanism.
 *
 * Invariant: at most ONE live JobRuntime per process per database. Recovery
 * treats every active row outside this instance's in-flight and
 * startup-created sets as a prior-process leftover, so a second live instance
 * would reset/cancel the first one's active work. The container now holds that
 * invariant — see the class comment.
 */
import { loggerService } from '@logger';

import { BaseService, DependsOn, Injectable, Phase, ServicePhase } from '@/backend/core/lifecycle';
import type { Database, DbService } from '@/backend/data/db/DbService';
import type { InsertJobRow, JobRow } from '@/backend/data/db/schemas/job';
import {
  jobService as hostJobService,
  type JobService,
  type TerminalJobStatus,
} from '@/backend/data/services/JobService';
import { paintingService } from '@/backend/data/services/PaintingService';
import { paintingFileStorage } from '@/backend/services/paintings/paintingFileStorage';
import {
  createPaintingGenerateJobHandler,
  type PaintingAi,
} from '@/backend/services/paintings/tasks/paintingGenerateJobHandler';

import type { JobPayloadOf, JobType } from './jobRegistry';
import { computeBackoff } from './runtime/backoff';
import { type RecoveryRepo, runStartupRecovery } from './runtime/recovery';
import {
  DEFAULT_CANCEL_TIMEOUT_MS,
  DEFAULT_GLOBAL_MAX_CONCURRENCY,
  DEFAULT_RETRY_POLICY,
  type EnqueueOptions,
  GC_KEEP_PER_TYPE,
  GC_TERMINAL_TTL_MS,
  type JobCancelResult,
  type JobContext,
  type JobHandle,
  type JobHandler,
  type JobHandlerFor,
  MAX_CANCEL_REASON_CHARS,
  MAX_INPUT_BYTES,
  type PumpRequest,
  type PumpResult,
} from './types';

const logger = loggerService.withContext('JobRuntime');

/**
 * How many dispatch-ordered candidates one claim transaction inspects.
 *
 * TOMBSTONE — read before adding a second handler. If every candidate in the
 * window is filtered out (no handler / not `foreground-only` / queue at cap),
 * this claim returns null and the pump stops, *without ever seeing runnable
 * rows past the window*. Ordering is `priority ASC, scheduledAt ASC, id ASC`,
 * so 10 older background rows can permanently starve a newer foreground one.
 * Unreachable today: the production registry is empty and every test handler
 * is `foreground-only`.
 * Fix before registering the first `bounded-background` handler: push the
 * executionClass filter down into SQL, or widen and retry when the whole
 * window is filtered.
 */
const CLAIM_CANDIDATE_WINDOW = 10;

/**
 * Bounded drain on teardown: long enough for an aborted handler to reject and
 * write one terminal transaction, short enough not to stall a Fast Refresh
 * unmount. Handlers may legitimately ignore the signal, so this can never be
 * an unbounded wait (unlike `ChatRuntime`, whose tasks all honor abort).
 */
export const DISPOSE_DRAIN_TIMEOUT_MS = 5_000;

/** setTimeout clamps above 2^31-1 ms; the pump re-arms long waits anyway. */
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

/**
 * Timeout is dispatched by aborting with this sentinel and matched with
 * `instanceof` on the abort reason — never by message text, so a handler
 * throwing `new Error('request timeout')` still classifies as HANDLER_THREW.
 */
export class JobHandlerTimeoutError extends Error {
  constructor() {
    super('JobHandlerTimeout');
    this.name = 'JobHandlerTimeoutError';
  }
}

/** Every entry is optional so the container can construct this with two arguments. */
export type JobRuntimeOptions = {
  /** Complete, immutable registry — frozen at construction. Defaults to {@link createHostHandlers}. */
  handlers?: readonly (readonly [string, JobHandler])[];
  jobService?: JobService;
  globalMaxConcurrency?: number;
  /** Injectable clock for tests. */
  now?: () => number;
  /** Progress sink; defaults to a no-op until a consumer exists (Phase 2+). */
  onProgress?: (jobId: string, progress: JobProgress) => void;
};

type FinishedResolver = {
  promise: Promise<JobSnapshot>;
  resolve: (snapshot: JobSnapshot) => void;
};

function makeError(code: string, message: string, params?: Record<string, unknown>): Error {
  return Object.assign(new Error(`${code}: ${message}`), { code, params, retryable: false });
}

/**
 * The production registry. Assembled here rather than in composition because
 * every piece a handler needs is reachable from the host: the AI capability
 * through `@DependsOn`, the rest as module singletons.
 *
 * It is typed as the handler's own narrow port, not as `AiService`: this layer
 * receives AI capabilities as interfaces, and the container's positional
 * injection hands over whatever `AiService` resolves to regardless.
 */
function createHostHandlers(ai: PaintingAi): readonly (readonly [string, JobHandler])[] {
  return [
    jobHandlerEntry(
      'painting.generate',
      createPaintingGenerateJobHandler({
        ai,
        paintings: paintingService,
        storage: paintingFileStorage,
      }),
    ),
  ];
}

/**
 * The single place a typed handler is erased for storage, mirroring desktop's
 * `registerHandler<K>(type, handler)`. Composition passes an array rather than
 * calling a register method, so this is what still checks that the handler's
 * payload matches the type's registry entry — write the tuple by hand and that
 * check is gone.
 */
export function jobHandlerEntry<K extends JobType>(
  type: K,
  handler: JobHandlerFor<K>,
): readonly [string, JobHandler] {
  return [type, handler as JobHandler];
}

/**
 * `PostReady`: the cold-start pump runs recovery and a GC sweep over the whole
 * ledger, which must never sit in front of first paint. The Data API reaches
 * `enqueueTx`/`cancel` synchronously, but those need only the instance — which
 * composition resolves before the gate opens — not its initialization.
 *
 * `liveRuntimesByDb`, the WeakMap that used to reject a second runtime over one
 * database, is gone. The container memoizes one instance per host, and
 * `application.install()` disposes the outgoing host to completion before the
 * incoming one starts, so two live runtimes can no longer reach the same
 * ledger. The guard could not have caught the cross-host case anyway once
 * `DbService` itself became per-host: two hosts key two different instances.
 */
@Injectable('JobRuntime')
@ServicePhase(Phase.PostReady)
@DependsOn(['DbService', 'AiService'])
export class JobRuntime extends BaseService {
  private readonly dbService: DbService;
  private readonly jobService: JobService;
  private readonly handlers: ReadonlyMap<string, JobHandler>;
  private readonly globalMaxConcurrency: number;
  private readonly now: () => number;
  private readonly onProgress: (jobId: string, progress: JobProgress) => void;

  private readonly abortControllers = new Map<string, AbortController>();
  private readonly inFlightExecuted = new Map<string, Promise<void>>();
  private readonly finishedResolvers = new Map<string, FinishedResolver>();
  private readonly timeoutHandles = new Map<string, ReturnType<typeof setTimeout>>();
  /** enqueueTx rows awaiting post-commit existence verification. */
  private readonly pendingTxVerifications = new Set<string>();
  /**
   * Rows this instance created before lazy startup recovery ran — they are not
   * prior-process leftovers, so recovery must not apply strategies to them.
   * (An idempotency HIT is deliberately unprotected: the row it returns IS a
   * prior-process leftover.) Cleared once recovery settles.
   */
  private startupLocalIds: Set<string> | null = new Set();

  private pumpRunning = false;
  private pumpDirty = false;
  private gcRequested = false;
  private currentLoop: Promise<PumpResult> | null = null;
  private recoveryDone: Promise<void> | null = null;
  private delayedTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  /**
   * The container passes `dbService` and the resolved `AiService`; a suite adds
   * its own handlers, which is why `ai` — needed only to build the production
   * registry — is then never read.
   */
  constructor(dbService: DbService, ai: PaintingAi, options: JobRuntimeOptions = {}) {
    super();
    this.dbService = dbService;
    this.jobService = options.jobService ?? hostJobService;
    const handlers = new Map<string, JobHandler>();
    for (const [type, handler] of options.handlers ?? createHostHandlers(ai)) {
      if (handlers.has(type)) {
        throw new Error(`Duplicate job handler registration for type "${type}"`);
      }
      handlers.set(type, handler);
    }
    this.handlers = handlers;
    this.globalMaxConcurrency = options.globalMaxConcurrency ?? DEFAULT_GLOBAL_MAX_CONCURRENCY;
    this.now = options.now ?? Date.now;
    this.onProgress = options.onProgress ?? (() => {});
  }

  /**
   * The cold-start pump: lazy startup recovery over prior-process leftovers,
   * the terminal-row GC sweep, and whatever is already runnable.
   */
  protected async onInit(): Promise<void> {
    await this.pump({ reason: 'cold-start' });
  }

  async enqueue<K extends JobType>(
    type: K,
    input: JobPayloadOf<K>,
    opts: EnqueueOptions = {},
  ): Promise<JobHandle> {
    this.assertNotDisposed();
    const insertRow = this.prepareEnqueue(type, input, opts);
    const snapshot = await this.dbService.withWriteTx(async (tx) => {
      if (opts.idempotencyKey) {
        const existing = await this.jobService.findActiveByIdempotencyKeyTx(
          tx,
          opts.idempotencyKey,
        );
        if (existing) return existing;
      }
      const created = await this.jobService.createTx(tx, insertRow);
      this.startupLocalIds?.add(created.id);
      return created;
    });
    const handle = this.handleFor(snapshot);
    if (snapshot.status === 'pending') this.schedulePump();
    else if (snapshot.status === 'delayed') void this.armDelayedTimer();
    return handle;
  }

  /**
   * Transactional enqueue: the INSERT rides the caller's `withWriteTx`
   * transaction so a business write and the job commit atomically. On rollback
   * the row never existed — the handle's `finished` never settles (the next
   * pump drops the resolver) and an idempotency-key collision aborts the whole
   * caller transaction.
   */
  async enqueueTx<K extends JobType>(
    tx: Database,
    type: K,
    input: JobPayloadOf<K>,
    opts: EnqueueOptions = {},
  ): Promise<JobHandle> {
    this.assertNotDisposed();
    const insertRow = this.prepareEnqueue(type, input, opts);
    if (opts.idempotencyKey) {
      const existing = await this.jobService.findActiveByIdempotencyKeyTx(tx, opts.idempotencyKey);
      if (existing) return this.handleFor(existing);
    }
    const snapshot = await this.jobService.createTx(tx, insertRow);
    this.startupLocalIds?.add(snapshot.id);
    this.pendingTxVerifications.add(snapshot.id);
    const handle = this.handleFor(snapshot);
    // The pump's claim transaction queues behind the caller's transaction in
    // DbService's serialized write queue, so it observes committed truth: a
    // rolled-back row simply won't exist and its resolver is dropped there.
    this.schedulePump();
    return handle;
  }

  async cancel(jobId: string, reason?: string): Promise<JobCancelResult> {
    if (this.disposed) return { outcome: 'not-cancellable' };
    if (reason !== undefined && reason.length > MAX_CANCEL_REASON_CHARS) {
      throw makeError(
        JOB_ERROR_CODES.CANCEL_REASON_TOO_LONG,
        `Cancel reason exceeds ${MAX_CANCEL_REASON_CHARS} characters`,
        { length: reason.length },
      );
    }

    // Persist the intent first — it survives a crash mid-cancellation and
    // overrides every recovery strategy on the next cold start.
    await this.dbService.withWriteTx((tx) => this.jobService.setCancelRequestedTx(tx, jobId));

    const controller = this.abortControllers.get(jobId);
    if (controller) {
      controller.abort(new Error(`Job cancelled${reason ? `: ${reason}` : ''}`));
      const snapshot = await this.jobService.getById(jobId);
      const handler = snapshot ? this.handlers.get(snapshot.type) : undefined;
      const graceMs = handler?.cancelTimeoutMs ?? DEFAULT_CANCEL_TIMEOUT_MS;
      const executed = this.inFlightExecuted.get(jobId);
      if (executed) {
        const winner = await new Promise<'done' | 'timeout'>((resolve) => {
          const timer = setTimeout(() => resolve('timeout'), graceMs);
          void executed.then(() => {
            clearTimeout(timer);
            resolve('done');
          });
        });
        if (winner === 'timeout') {
          logger.warn('cancel timed out — forcing terminal state', { graceMs, jobId });
          await this.finalizeJob(
            jobId,
            'cancelled',
            undefined,
            {
              code: JOB_ERROR_CODES.CANCELLED,
              message: `Cancel timed out after ${graceMs}ms${reason ? ` (reason: ${reason})` : ''}`,
              retryable: false,
            },
            ['running'],
          );
          return { outcome: 'timed-out' };
        }
      }
      return { outcome: 'cancelled' };
    }

    const snapshot = await this.jobService.getById(jobId);
    if (snapshot && (snapshot.status === 'pending' || snapshot.status === 'delayed')) {
      await this.finalizeJob(
        jobId,
        'cancelled',
        undefined,
        {
          code: JOB_ERROR_CODES.CANCELLED,
          message: reason ?? 'Cancelled by user',
          retryable: false,
        },
        ['pending', 'delayed'],
      );
      return { outcome: 'cancelled' };
    }
    return { outcome: 'not-cancellable' };
  }

  pump(request: PumpRequest): Promise<PumpResult> {
    if (this.disposed) return Promise.resolve({ claimed: 0 });
    if (request.reason === 'cold-start') this.gcRequested = true;
    if (this.pumpRunning) {
      this.pumpDirty = true;
      return this.currentLoop ?? Promise.resolve({ claimed: 0 });
    }
    this.pumpRunning = true;
    this.currentLoop = this.runPumpLoop();
    return this.currentLoop;
  }

  /**
   * Abort every in-flight handler, then wait (bounded) for them to write their
   * terminal rows before `DbService` — a declared dependency, so it stops
   * later — closes SQLite. Rows still `running` when the drain times out are
   * left for the next cold start's recovery.
   */
  protected async onStop(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    if (this.delayedTimer) {
      clearTimeout(this.delayedTimer);
      this.delayedTimer = null;
    }
    for (const handle of this.timeoutHandles.values()) clearTimeout(handle);
    this.timeoutHandles.clear();
    for (const controller of this.abortControllers.values()) {
      controller.abort(new Error('Job runtime disposed'));
    }

    // Drop resolvers BEFORE draining, not after. The drain lets handlers land
    // their terminal rows, and `finalizeJob` would otherwise resolve `finished`
    // for whichever ones happen to finish inside the window — making the
    // "never settles after dispose()" contract depend on a race. Callers get a
    // deterministic guarantee instead; the ledger is the way to observe
    // outcomes across teardown.
    this.finishedResolvers.clear();
    this.pendingTxVerifications.clear();

    // Snapshot before awaiting: each task removes itself in its `finally`.
    // These promises resolve *after* `finalizeJob`, so draining them is what
    // buys the terminal write a chance to land before SQLite closes. Bounded,
    // because a handler is allowed to ignore the abort signal entirely.
    const inFlight = [...this.inFlightExecuted.values()];
    if (inFlight.length === 0) return;
    let drainTimer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.allSettled(inFlight),
      new Promise<void>((resolve) => {
        drainTimer = setTimeout(resolve, DISPOSE_DRAIN_TIMEOUT_MS);
      }),
    ]);
    clearTimeout(drainTimer);
  }

  // -------------------------------------------------------------------------
  // Enqueue internals
  // -------------------------------------------------------------------------

  private prepareEnqueue(type: string, input: unknown, opts: EnqueueOptions): InsertJobRow {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw makeError(JOB_ERROR_CODES.UNKNOWN_TYPE, `No handler registered for type "${type}"`, {
        type,
      });
    }

    const inputForSizing = input === undefined ? null : input;
    const inputJsonLength = JSON.stringify(inputForSizing).length;
    if (inputJsonLength > MAX_INPUT_BYTES) {
      throw makeError(JOB_ERROR_CODES.PAYLOAD_TOO_LARGE, 'Job input payload exceeds 1MB', {
        sizeBytes: inputJsonLength,
        type,
      });
    }
    if (
      opts.maxAttempts !== undefined &&
      (!Number.isInteger(opts.maxAttempts) || opts.maxAttempts < 1)
    ) {
      throw makeError('JOB_INVALID_MAX_ATTEMPTS', 'maxAttempts must be an integer >= 1', {
        maxAttempts: opts.maxAttempts,
      });
    }
    if (opts.timeoutMs !== undefined && (!Number.isInteger(opts.timeoutMs) || opts.timeoutMs < 1)) {
      throw makeError('JOB_INVALID_TIMEOUT_MS', 'timeoutMs must be an integer >= 1', {
        timeoutMs: opts.timeoutMs,
      });
    }

    const now = this.now();
    const scheduledAt = opts.scheduledAt ?? now;
    return {
      attempt: 0,
      cancelRequested: false,
      idempotencyKey: opts.idempotencyKey ?? null,
      input: inputForSizing,
      maxAttempts:
        opts.maxAttempts ??
        handler.defaultRetryPolicy?.maxAttempts ??
        DEFAULT_RETRY_POLICY.maxAttempts,
      metadata: opts.metadata ?? {},
      parentId: opts.parentId ?? null,
      priority: opts.priority ?? 0,
      queue: opts.queue ?? handler.defaultQueue?.(input as never) ?? type,
      scheduledAt,
      scheduleId: opts.scheduleId ?? null,
      status: scheduledAt > now ? 'delayed' : 'pending',
      timeoutMs: opts.timeoutMs ?? handler.defaultTimeoutMs ?? null,
      type,
    };
  }

  private handleFor(snapshot: JobSnapshot): JobHandle {
    const existing = this.finishedResolvers.get(snapshot.id);
    if (existing) return { finished: existing.promise, id: snapshot.id, snapshot };
    if (isTerminalStatus(snapshot.status)) {
      return { finished: Promise.resolve(snapshot), id: snapshot.id, snapshot };
    }
    let resolve!: (value: JobSnapshot) => void;
    const promise = new Promise<JobSnapshot>((res) => {
      resolve = res;
    });
    this.finishedResolvers.set(snapshot.id, { promise, resolve });
    return { finished: promise, id: snapshot.id, snapshot };
  }

  // -------------------------------------------------------------------------
  // Pump
  // -------------------------------------------------------------------------

  private schedulePump(): void {
    void this.pump({ reason: 'enqueue' });
  }

  private async runPumpLoop(): Promise<PumpResult> {
    let claimed = 0;
    try {
      do {
        this.pumpDirty = false;
        claimed += await this.pumpOnce();
      } while (this.pumpDirty && !this.disposed);
    } catch (error) {
      logger.error('pump loop failed', error as Error);
    } finally {
      this.pumpRunning = false;
      this.currentLoop = null;
    }
    return { claimed };
  }

  private async pumpOnce(): Promise<number> {
    await this.ensureRecovered();
    if (this.disposed) return 0;

    await this.dbService.withWriteTx(async (tx) => {
      await this.verifyPendingTxRows(tx);
      await this.jobService.promoteDelayedDueTx(tx, this.now());
    });

    let claimedCount = 0;
    while (!this.disposed) {
      const row = await this.claimNext();
      if (!row) break;
      claimedCount += 1;
      this.spawnExecute(row);
    }

    if (this.gcRequested) {
      this.gcRequested = false;
      await this.runGc();
    }
    await this.armDelayedTimer();
    return claimedCount;
  }

  private async claimNext(): Promise<JobRow | null> {
    return this.dbService.withWriteTx(async (tx) => {
      const globalRunning = await this.jobService.countRunningGlobalTx(tx);
      if (globalRunning >= this.globalMaxConcurrency) return null;
      const runningPerQueue = await this.jobService.countRunningPerQueueTx(tx);
      const now = this.now();
      const candidates = await this.jobService.getEligiblePendingTx(
        tx,
        now,
        CLAIM_CANDIDATE_WINDOW,
      );
      for (const candidate of candidates) {
        const handler = this.handlers.get(candidate.type);
        // Orphan rows wait for recovery's sweep; never execute without a handler.
        if (!handler) continue;
        // Phase 1 runs a foreground window only; other classes stay enqueued
        // until their platform adapters exist.
        if (handler.executionClass !== 'foreground-only') continue;
        if (this.inFlightExecuted.has(candidate.id)) continue;
        const queueCap = handler.defaultConcurrency ?? 1;
        if ((runningPerQueue.get(candidate.queue) ?? 0) >= queueCap) continue;
        const claimed = await this.jobService.claimPendingByIdTx(tx, candidate.id, now);
        if (claimed) return claimed;
      }
      return null;
    });
  }

  /** Drop resolvers of enqueueTx rows whose caller transaction rolled back. */
  private async verifyPendingTxRows(tx: Database): Promise<void> {
    if (this.pendingTxVerifications.size === 0) return;
    const ids = [...this.pendingTxVerifications];
    this.pendingTxVerifications.clear();
    for (const id of ids) {
      const row = await this.jobService.getRowByIdTx(tx, id);
      if (!row) this.finishedResolvers.delete(id);
    }
  }

  private ensureRecovered(): Promise<void> {
    this.recoveryDone ??= this.runRecovery().catch((error) => {
      // Recovery is restartable and every step is fenced; a failure here must
      // not wedge the pump forever.
      logger.error('startup recovery failed', error as Error);
    });
    return this.recoveryDone;
  }

  private async runRecovery(): Promise<void> {
    const repo: RecoveryRepo = {
      cancelByIds: (ids, error) =>
        this.dbService.withWriteTx((tx) => this.jobService.cancelByIdsTx(tx, ids, error)),
      getActiveByType: (type) => this.jobService.getActiveByType(type),
      getStaleActive: () => this.jobService.getStaleActive(),
      resetToPendingByIds: (ids) =>
        this.dbService.withWriteTx((tx) => this.jobService.resetToPendingByIdsTx(tx, ids)),
    };
    try {
      const stats = await runStartupRecovery(
        repo,
        this.handlers,
        (jobId) => this.inFlightExecuted.has(jobId) || (this.startupLocalIds?.has(jobId) ?? false),
      );
      logger.info('startup recovery done', { ...stats });
    } finally {
      this.startupLocalIds = null;
    }
  }

  private async runGc(): Promise<void> {
    try {
      await this.dbService.withWriteTx((tx) =>
        this.jobService.pruneTerminalOlderThanTx(tx, this.now() - GC_TERMINAL_TTL_MS),
      );
    } catch (error) {
      logger.warn('job GC (terminal TTL) failed', error as Error);
    }
    try {
      await this.dbService.withWriteTx((tx) =>
        this.jobService.pruneTerminalKeepLatestPerTypeTx(tx, GC_KEEP_PER_TYPE),
      );
    } catch (error) {
      logger.warn('job GC (keep latest per type) failed', error as Error);
    }
  }

  private async armDelayedTimer(): Promise<void> {
    if (this.disposed) return;
    const earliest = await this.jobService.earliestDelayedAt().catch(() => null);
    if (this.delayedTimer) {
      clearTimeout(this.delayedTimer);
      this.delayedTimer = null;
    }
    if (earliest === null || this.disposed) return;
    const delay = Math.min(Math.max(earliest - this.now(), 0), MAX_TIMER_DELAY_MS);
    this.delayedTimer = setTimeout(() => {
      this.delayedTimer = null;
      void this.pump({ reason: 'timer' });
    }, delay);
  }

  // -------------------------------------------------------------------------
  // Execution
  // -------------------------------------------------------------------------

  private spawnExecute(row: JobRow): void {
    const handler = this.handlers.get(row.type);
    if (!handler) {
      void this.finalizeJob(
        row.id,
        'failed',
        undefined,
        {
          code: JOB_ERROR_CODES.UNKNOWN_TYPE,
          message: `No handler registered for type "${row.type}"`,
          retryable: false,
        },
        ['running'],
      );
      return;
    }
    if (this.inFlightExecuted.has(row.id)) {
      logger.warn('spawnExecute: job already in flight — skipping duplicate', { jobId: row.id });
      return;
    }

    const controller = new AbortController();
    this.abortControllers.set(row.id, controller);
    let resolveExecuted!: () => void;
    const executed = new Promise<void>((resolve) => {
      resolveExecuted = resolve;
    });
    this.inFlightExecuted.set(row.id, executed);

    if (row.timeoutMs !== null && row.timeoutMs > 0) {
      const handle = setTimeout(
        () => controller.abort(new JobHandlerTimeoutError()),
        row.timeoutMs,
      );
      this.timeoutHandles.set(row.id, handle);
    }

    let currentMetadata: Record<string, unknown> = { ...row.metadata };
    const ctx: JobContext = {
      attempt: row.attempt,
      input: row.input,
      jobId: row.id,
      logger: loggerService.withContext('JobExec', { jobId: row.id, type: row.type }),
      metadata: Object.freeze({ ...currentMetadata }),
      parentId: row.parentId,
      patchMetadata: async (patch) => {
        const merged = { ...currentMetadata, ...patch };
        const updated = await this.dbService.withWriteTx((tx) =>
          this.jobService.setMetadataTx(tx, row.id, merged),
        );
        if (updated === 0) {
          logger.warn('patchMetadata fenced: job is no longer running', { jobId: row.id });
        }
        currentMetadata = merged;
      },
      reportProgress: (progress, detail) => {
        this.onProgress(row.id, { detail, progress });
      },
      signal: controller.signal,
    };

    const task = (async () => {
      try {
        const output = await handler.execute(ctx);
        this.clearTimeoutHandle(row.id);
        await this.finalizeJob(row.id, 'completed', output, null, ['running']);
      } catch (err) {
        this.clearTimeoutHandle(row.id);
        // Classification is state-based (abort flag + sentinel reason), never
        // message-text-based.
        const isAbort = controller.signal.aborted;
        const abortReason: unknown = controller.signal.reason;
        const isTimeout = isAbort && abortReason instanceof JobHandlerTimeoutError;
        const userCancel = isAbort && !isTimeout;
        const thrownMessage = err instanceof Error ? err.message : String(err);
        const cancelMessage = abortReason instanceof Error ? abortReason.message : null;
        const error: JobError = userCancel
          ? {
              code: JOB_ERROR_CODES.CANCELLED,
              message: cancelMessage || thrownMessage || 'Cancelled',
              retryable: false,
            }
          : {
              code: isTimeout ? JOB_ERROR_CODES.HANDLER_TIMEOUT : JOB_ERROR_CODES.HANDLER_THREW,
              message: thrownMessage,
              retryable: true,
            };
        const canRetry = !userCancel && error.retryable && row.attempt + 1 < row.maxAttempts;
        if (canRetry) {
          const retryPolicy = handler.defaultRetryPolicy ?? DEFAULT_RETRY_POLICY;
          const backoffMs = computeBackoff(retryPolicy, row.attempt + 1);
          await this.scheduleRetry(row.id, row.attempt + 1, this.now() + backoffMs, error);
        } else {
          await this.finalizeJob(row.id, userCancel ? 'cancelled' : 'failed', undefined, error, [
            'running',
          ]);
        }
      } finally {
        this.clearTimeoutHandle(row.id);
        this.abortControllers.delete(row.id);
        this.inFlightExecuted.delete(row.id);
        resolveExecuted();
      }
    })();

    // Hard guarantee: nothing escapes as an unhandled rejection. A leak here
    // leaves the row `running` for the next cold start's recovery.
    task.catch(async (leaked: unknown) => {
      logger.error('spawnExecute leaked past the job pipeline', leaked as Error);
      await this.finalizeJob(
        row.id,
        'failed',
        undefined,
        {
          code: JOB_ERROR_CODES.HANDLER_THREW,
          message: `Internal error leaked past job pipeline: ${leaked instanceof Error ? leaked.message : String(leaked)}`,
          retryable: false,
        },
        ['running'],
      ).catch(() => {});
    });
  }

  // -------------------------------------------------------------------------
  // Settlement
  // -------------------------------------------------------------------------

  /**
   * Side-effect order is load-bearing (desktop-verbatim): terminal write →
   * re-read → resolve `finished` + kick the pump → await onSettled with
   * errors swallowed.
   */
  private async finalizeJob(
    jobId: string,
    status: TerminalJobStatus,
    output: unknown | undefined,
    error: JobError | null,
    expectedStatuses: readonly JobStatus[],
  ): Promise<void> {
    let updated = 0;
    let txFailed: Error | undefined;
    try {
      updated = await this.dbService.withWriteTx((tx) =>
        this.jobService.setTerminalTx(tx, jobId, status, output, error, expectedStatuses),
      );
    } catch (err) {
      txFailed = err as Error;
      logger.error('finalizeJob: terminal write failed — synthesizing snapshot', txFailed);
    }

    const persisted = await this.jobService.getById(jobId).catch(() => null);

    if (updated === 0 && !txFailed) {
      // Weak fence held: another path finalized (or retried) this row first.
      // Late callbacks release awaiters at most; they never overwrite state.
      if (persisted && isTerminalStatus(persisted.status)) {
        this.resolveFinished(jobId, persisted);
      } else {
        logger.warn('finalizeJob fenced: row is not in an expected state', {
          jobId,
          status: persisted?.status,
        });
      }
      this.schedulePump();
      return;
    }

    const snapshot =
      persisted ??
      this.synthesizeFailedSnapshot(jobId, txFailed ?? new Error('row disappeared after write'));
    this.resolveFinished(jobId, snapshot);
    this.schedulePump();

    const handler = this.handlers.get(snapshot.type);
    if (handler?.onSettled && persisted && !txFailed) {
      try {
        await handler.onSettled({
          attempt: snapshot.attempt,
          error: snapshot.error,
          input: snapshot.input,
          jobId,
          metadata: snapshot.metadata,
          output: snapshot.output ?? undefined,
          parentId: snapshot.parentId,
          scheduleId: snapshot.scheduleId,
          status,
          type: snapshot.type,
        });
      } catch (settledError) {
        logger.warn('handler.onSettled threw — ignoring', settledError as Error);
      }
    }
  }

  private async scheduleRetry(
    jobId: string,
    nextAttempt: number,
    scheduledAt: number,
    error: JobError,
  ): Promise<void> {
    let updated = 0;
    try {
      updated = await this.dbService.withWriteTx((tx) =>
        this.jobService.setDelayedRetryTx(tx, jobId, nextAttempt, scheduledAt, error),
      );
    } catch (retryWriteError) {
      logger.error(
        'scheduleRetry: persist failed — degrading to terminal failed',
        retryWriteError as Error,
      );
      await this.finalizeJob(
        jobId,
        'failed',
        undefined,
        {
          code: JOB_ERROR_CODES.HANDLER_THREW,
          message: `Retry persist failed: ${
            retryWriteError instanceof Error ? retryWriteError.message : String(retryWriteError)
          }; original: ${error.message}`,
          retryable: true,
        },
        ['running'],
      );
      return;
    }
    if (updated === 0) {
      logger.warn('scheduleRetry fenced: job is no longer running — dropping retry', { jobId });
      return;
    }
    await this.armDelayedTimer();
  }

  private resolveFinished(jobId: string, snapshot: JobSnapshot): void {
    const resolver = this.finishedResolvers.get(jobId);
    if (!resolver) return;
    this.finishedResolvers.delete(jobId);
    resolver.resolve(snapshot);
  }

  /** Unblocks awaiters when the terminal write itself failed; UI-only value. */
  private synthesizeFailedSnapshot(jobId: string, cause: Error): JobSnapshot {
    const nowIso = new Date(this.now()).toISOString();
    return {
      attempt: 0,
      cancelRequested: true,
      createdAt: nowIso,
      error: { code: 'JOB_FINALIZE_TX_FAILED', message: cause.message, retryable: true },
      finishedAt: nowIso,
      id: jobId,
      idempotencyKey: null,
      input: null,
      maxAttempts: 1,
      metadata: {},
      output: null,
      parentId: null,
      priority: 0,
      queue: 'unknown',
      scheduledAt: nowIso,
      scheduleId: null,
      startedAt: null,
      status: 'failed',
      timeoutMs: null,
      type: 'unknown',
      updatedAt: nowIso,
    };
  }

  private clearTimeoutHandle(jobId: string): void {
    const handle = this.timeoutHandles.get(jobId);
    if (handle !== undefined) {
      clearTimeout(handle);
      this.timeoutHandles.delete(jobId);
    }
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error('JobRuntime disposed');
  }
}
