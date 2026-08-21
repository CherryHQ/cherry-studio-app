import { loggerService } from '@logger';
import { and, asc, count, desc, eq, inArray, lte, type SQL } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import type { Database } from '@/backend/data/db/DbService';
import { type InsertJobRow, type JobRow, jobTable } from '@/backend/data/db/schemas/job';
import {
  ACTIVE_JOB_STATUSES,
  type JobError,
  JobErrorSchema,
  type JobSnapshot,
  type JobStatus,
  TERMINAL_JOB_STATUSES,
} from '@/shared/data/api/schemas/jobs';

import { timestampToISO } from './utils/rowMappers';

const logger = loggerService.withContext('JobService');

export type TerminalJobStatus = Extract<JobStatus, 'cancelled' | 'completed' | 'failed'>;

export type SetTerminalResult = {
  snapshot: JobSnapshot | null;
  updated: boolean;
};

export type JobListFilter = {
  limit?: number;
  offset?: number;
  parentId?: string;
  queue?: string;
  status?: JobStatus[];
  type?: string | string[];
};

/**
 * Best-effort validate the `error` column against JobErrorSchema. Drizzle only
 * checks JSON syntax, not shape, so schema drift between app versions (or a
 * manual SQL edit) can leak through. On failure log a warn and return a
 * sentinel, so callers still receive a typed value rather than a structurally
 * invalid object.
 */
function validateError(rowId: string, parsed: unknown): JobError | null {
  if (parsed === null) return null;
  const result = JobErrorSchema.safeParse(parsed);
  if (result.success) return result.data;
  logger.warn('Job error column failed schema validation — using sentinel', {
    issues: result.error.issues.map((issue) => issue.message),
    rowId,
  });
  return {
    code: 'JOB_CORRUPT_ERROR_ROW',
    message: 'Persisted error column did not match JobErrorSchema',
    retryable: false,
  };
}

function rowToSnapshot(row: JobRow): JobSnapshot {
  return {
    attempt: row.attempt,
    cancelRequested: row.cancelRequested,
    createdAt: timestampToISO(row.createdAt),
    error: validateError(row.id, row.error),
    finishedAt: row.finishedAt === null ? null : timestampToISO(row.finishedAt),
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    input: row.input,
    maxAttempts: row.maxAttempts,
    metadata: row.metadata,
    output: row.output ?? null,
    parentId: row.parentId,
    priority: row.priority,
    queue: row.queue,
    scheduledAt: timestampToISO(row.scheduledAt),
    startedAt: row.startedAt === null ? null : timestampToISO(row.startedAt),
    status: row.status as JobStatus,
    timeoutMs: row.timeoutMs,
    type: row.type,
    updatedAt: timestampToISO(row.updatedAt),
  };
}

export class JobService {
  /**
   * Resolved per call rather than injected once, so the instance holds no
   * reference to a particular host generation and a replaced host cannot leave
   * this singleton writing to a closed connection.
   */
  private get dbService() {
    return application.get('DbService');
  }

  async list(filter: JobListFilter = {}): Promise<JobSnapshot[]> {
    const conditions: SQL[] = [];
    if (filter.status?.length) conditions.push(inArray(jobTable.status, filter.status));
    if (filter.queue) conditions.push(eq(jobTable.queue, filter.queue));
    if (Array.isArray(filter.type)) {
      if (filter.type.length) conditions.push(inArray(jobTable.type, filter.type));
    } else if (filter.type) conditions.push(eq(jobTable.type, filter.type));
    if (filter.parentId) conditions.push(eq(jobTable.parentId, filter.parentId));
    let query = this.dbService
      .getDb()
      .select()
      .from(jobTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(jobTable.createdAt))
      .$dynamic();
    if (filter.limit !== undefined) query = query.limit(filter.limit);
    if (filter.offset !== undefined) query = query.offset(filter.offset);
    return (await query).map(rowToSnapshot);
  }

  async getById(id: string): Promise<JobSnapshot | null> {
    const [row] = await this.dbService
      .getDb()
      .select()
      .from(jobTable)
      .where(eq(jobTable.id, id))
      .limit(1);
    return row ? rowToSnapshot(row) : null;
  }

  async create(row: InsertJobRow): Promise<JobSnapshot> {
    return this.dbService.withWriteTx((tx) => this.createTx(tx, row));
  }

  // -------------------------------------------------------------------------
  // Runtime writers. Keep aligned with desktop src/main/data/services/
  // JobService.ts. Every mutation — including single statements — MUST run
  // inside `DbService.withWriteTx`: on the async single connection a stray
  // write issued outside the serialized queue can interleave into another
  // transaction's BEGIN IMMEDIATE … COMMIT window (desktop is immune because
  // better-sqlite3 is synchronous; we are not). The `*Tx` methods take the
  // transaction database and never open their own.
  // -------------------------------------------------------------------------

  async createTx(tx: Database, row: InsertJobRow): Promise<JobSnapshot> {
    const [created] = await tx.insert(jobTable).values(row).returning();
    if (!created) throw new Error('Insert did not return a job');
    return rowToSnapshot(created);
  }

  /** At most one non-terminal job per idempotency key (partial unique index). */
  async findActiveByIdempotencyKeyTx(tx: Database, key: string): Promise<JobSnapshot | null> {
    const [row] = await tx
      .select()
      .from(jobTable)
      .where(
        and(eq(jobTable.idempotencyKey, key), inArray(jobTable.status, [...ACTIVE_JOB_STATUSES])),
      )
      .limit(1);
    return row ? rowToSnapshot(row) : null;
  }

  /** Only `running` rows occupy a concurrency slot; backlog depth is free. */
  async countRunningGlobalTx(tx: Database): Promise<number> {
    const [row] = await tx
      .select({ value: count() })
      .from(jobTable)
      .where(eq(jobTable.status, 'running'));
    return row?.value ?? 0;
  }

  async countRunningPerQueueTx(tx: Database): Promise<Map<string, number>> {
    const rows = await tx
      .select({ queue: jobTable.queue, running: count() })
      .from(jobTable)
      .where(eq(jobTable.status, 'running'))
      .groupBy(jobTable.queue);
    return new Map(rows.map((row) => [row.queue, row.running]));
  }

  /**
   * Claim candidates in dispatch order. Desktop claims per queue
   * (claimNextPendingTx); the mobile pump selects globally and filters by
   * queue capacity in the runtime, so the select half lives here and the
   * guarded-update half in {@link claimPendingByIdTx}.
   */
  async getEligiblePendingTx(
    tx: Database,
    now: number,
    types: readonly string[],
    limit: number,
    offset = 0,
  ): Promise<JobRow[]> {
    if (types.length === 0) return [];
    return tx
      .select()
      .from(jobTable)
      .where(
        and(
          eq(jobTable.status, 'pending'),
          eq(jobTable.cancelRequested, false),
          lte(jobTable.scheduledAt, now),
          inArray(jobTable.type, [...types]),
        ),
      )
      .orderBy(asc(jobTable.priority), asc(jobTable.scheduledAt), asc(jobTable.id))
      .limit(limit)
      .offset(offset);
  }

  /**
   * The guarded `pending -> running` transition. Re-checking status and
   * cancelRequested in the UPDATE's WHERE closes the cancel/dispatch race.
   */
  async claimPendingByIdTx(tx: Database, id: string, now: number): Promise<JobRow | null> {
    const [claimed] = await tx
      .update(jobTable)
      .set({ startedAt: now, status: 'running' })
      .where(
        and(
          eq(jobTable.id, id),
          eq(jobTable.status, 'pending'),
          eq(jobTable.cancelRequested, false),
        ),
      )
      .returning();
    return claimed ?? null;
  }

  async getRowByIdTx(tx: Database, id: string): Promise<JobRow | null> {
    const [row] = await tx.select().from(jobTable).where(eq(jobTable.id, id)).limit(1);
    return row ?? null;
  }

  /**
   * Terminal write, fenced by `expectedStatuses` (mobile weak fence — desktop
   * updates by id alone because a stale finalizer cannot outlive its process
   * there). Returns the transaction-consistent snapshot plus whether this call
   * performed the update; `updated=false` means the fence held.
   */
  async setTerminalTx(
    tx: Database,
    id: string,
    status: TerminalJobStatus,
    output: unknown | undefined,
    error: JobError | null,
    expectedStatuses: readonly JobStatus[],
  ): Promise<SetTerminalResult> {
    const [updated] = await tx
      .update(jobTable)
      .set({
        error,
        finishedAt: Date.now(),
        output: output !== undefined ? output : null,
        status,
      })
      .where(and(eq(jobTable.id, id), inArray(jobTable.status, [...expectedStatuses])))
      .returning();
    if (updated) return { snapshot: rowToSnapshot(updated), updated: true };

    const [current] = await tx.select().from(jobTable).where(eq(jobTable.id, id)).limit(1);
    return { snapshot: current ? rowToSnapshot(current) : null, updated: false };
  }

  /**
   * Move a running row into retry backoff. Fenced on `status='running'`;
   * returns 0 when the row was cancelled/finalized concurrently and the retry
   * must be dropped.
   */
  async setDelayedRetryTx(
    tx: Database,
    id: string,
    attempt: number,
    scheduledAt: number,
    error: JobError | null,
  ): Promise<number> {
    const updated = await tx
      .update(jobTable)
      .set({ attempt, error, scheduledAt, startedAt: null, status: 'delayed' })
      .where(and(eq(jobTable.id, id), eq(jobTable.status, 'running')))
      .returning({ id: jobTable.id });
    return updated.length;
  }

  async setCancelRequestedTx(tx: Database, id: string): Promise<void> {
    await tx.update(jobTable).set({ cancelRequested: true }).where(eq(jobTable.id, id));
  }

  /** Caller passes the already-merged object. Fenced on `status='running'`. */
  async setMetadataTx(
    tx: Database,
    id: string,
    metadata: Record<string, unknown>,
  ): Promise<number> {
    const updated = await tx
      .update(jobTable)
      .set({ metadata })
      .where(and(eq(jobTable.id, id), eq(jobTable.status, 'running')))
      .returning({ id: jobTable.id });
    return updated.length;
  }

  /** `delayed` rows whose time has come go back to `pending`. Idempotent. */
  async promoteDelayedDueTx(tx: Database, now: number): Promise<number> {
    const updated = await tx
      .update(jobTable)
      .set({ status: 'pending' })
      .where(and(eq(jobTable.status, 'delayed'), lte(jobTable.scheduledAt, now)))
      .returning({ id: jobTable.id });
    return updated.length;
  }

  async resetToPendingByIdsTx(tx: Database, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await tx
      .update(jobTable)
      .set({ startedAt: null, status: 'pending' })
      .where(inArray(jobTable.id, [...ids]));
  }

  async cancelByIdsTx(tx: Database, ids: readonly string[], error: JobError | null): Promise<void> {
    if (ids.length === 0) return;
    await tx
      .update(jobTable)
      .set({ error, finishedAt: Date.now(), status: 'cancelled' })
      .where(inArray(jobTable.id, [...ids]));
  }

  async pruneTerminalOlderThanTx(tx: Database, cutoffMs: number): Promise<number> {
    const deleted = await tx
      .delete(jobTable)
      .where(
        and(
          inArray(jobTable.status, [...TERMINAL_JOB_STATUSES]),
          lte(jobTable.finishedAt, cutoffMs),
        ),
      )
      .returning({ id: jobTable.id });
    return deleted.length;
  }

  async pruneTerminalKeepLatestPerTypeTx(tx: Database, keepPerType: number): Promise<number> {
    const rows = await tx
      .select({ id: jobTable.id, type: jobTable.type })
      .from(jobTable)
      .where(inArray(jobTable.status, [...TERMINAL_JOB_STATUSES]))
      .orderBy(desc(jobTable.finishedAt), desc(jobTable.id));
    const seenPerType = new Map<string, number>();
    const toDelete: string[] = [];
    for (const row of rows) {
      const seen = (seenPerType.get(row.type) ?? 0) + 1;
      seenPerType.set(row.type, seen);
      if (seen > keepPerType) toDelete.push(row.id);
    }
    if (toDelete.length === 0) return 0;
    const deleted = await tx
      .delete(jobTable)
      .where(inArray(jobTable.id, toDelete))
      .returning({ id: jobTable.id });
    return deleted.length;
  }

  // -------------------------------------------------------------------------
  // Recovery/scheduling reads (WAL snapshot reads; no write transaction).
  // -------------------------------------------------------------------------

  /** Non-terminal rows of one type, newest first (uuidv7 id as tiebreaker). */
  async getActiveByType(type: string): Promise<JobRow[]> {
    return this.dbService
      .getDb()
      .select()
      .from(jobTable)
      .where(and(eq(jobTable.type, type), inArray(jobTable.status, [...ACTIVE_JOB_STATUSES])))
      .orderBy(desc(jobTable.createdAt), desc(jobTable.id));
  }

  async getStaleActive(): Promise<JobRow[]> {
    return this.dbService
      .getDb()
      .select()
      .from(jobTable)
      .where(inArray(jobTable.status, [...ACTIVE_JOB_STATUSES]));
  }

  /** Earliest `delayed` due time, for the foreground promotion timer. */
  async earliestDelayedAt(): Promise<number | null> {
    const [row] = await this.dbService
      .getDb()
      .select({ scheduledAt: jobTable.scheduledAt })
      .from(jobTable)
      .where(eq(jobTable.status, 'delayed'))
      .orderBy(asc(jobTable.scheduledAt))
      .limit(1);
    return row?.scheduledAt ?? null;
  }
}

export const jobService = new JobService();
