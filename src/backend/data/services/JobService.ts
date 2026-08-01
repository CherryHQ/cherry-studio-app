import { and, desc, eq, inArray, type SQL } from 'drizzle-orm';

import type { DbService } from '@/backend/data/db/DbService';
import { type InsertJobRow, type JobRow, jobTable } from '@/backend/data/db/schemas/job';
import {
  type JobError,
  JobErrorSchema,
  type JobSnapshot,
  type JobStatus,
} from '@/shared/data/api/schemas/jobs';

import { timestampToISO } from './utils/rowMappers';

export type JobListFilter = {
  limit?: number;
  offset?: number;
  parentId?: string;
  queue?: string;
  scheduleId?: string;
  status?: JobStatus[];
  type?: string | string[];
};

function rowToSnapshot(row: JobRow): JobSnapshot {
  const parsedError = row.error === null ? null : JobErrorSchema.safeParse(row.error);
  const error: JobError | null =
    parsedError === null
      ? null
      : parsedError.success
        ? parsedError.data
        : {
            code: 'JOB_CORRUPT_ERROR_ROW',
            message: 'Persisted error column did not match JobErrorSchema',
            retryable: false,
          };
  return {
    attempt: row.attempt,
    cancelRequested: row.cancelRequested,
    createdAt: timestampToISO(row.createdAt),
    error,
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
    scheduleId: row.scheduleId,
    scheduledAt: timestampToISO(row.scheduledAt),
    startedAt: row.startedAt === null ? null : timestampToISO(row.startedAt),
    status: row.status as JobStatus,
    timeoutMs: row.timeoutMs,
    type: row.type,
    updatedAt: timestampToISO(row.updatedAt),
  };
}

export class JobService {
  constructor(private readonly dbService: DbService) {}

  async list(filter: JobListFilter = {}): Promise<JobSnapshot[]> {
    const conditions: SQL[] = [];
    if (filter.status?.length) conditions.push(inArray(jobTable.status, filter.status));
    if (filter.queue) conditions.push(eq(jobTable.queue, filter.queue));
    if (Array.isArray(filter.type)) {
      if (filter.type.length) conditions.push(inArray(jobTable.type, filter.type));
    } else if (filter.type) conditions.push(eq(jobTable.type, filter.type));
    if (filter.scheduleId) conditions.push(eq(jobTable.scheduleId, filter.scheduleId));
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
    const [created] = await this.dbService.withWriteTx((tx) =>
      tx.insert(jobTable).values(row).returning(),
    );
    if (!created) throw new Error('Insert did not return a job');
    return rowToSnapshot(created);
  }
}
