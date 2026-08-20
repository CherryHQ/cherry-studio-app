import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import type { JobError } from '@/shared/data/api/schemas/jobs';

import { createUpdateTimestamps, uuidPrimaryKeyOrdered } from './_columnHelpers';

/**
 * Single source of truth for every job's lifecycle. Six states:
 *   pending → running → completed
 *           ↘ failed
 *           ↘ cancelled
 *           ↘ delayed (scheduledAt > now or retry backoff) → pending
 *
 * dispatch path reads: WHERE queue=? AND status='pending' AND scheduledAt<=now()
 * ORDER BY priority ASC, scheduledAt ASC LIMIT 1. The composite index
 * job_queue_status_scheduled_at_idx covers it.
 *
 * idempotencyKey partial unique guarantees at most one non-terminal job per key.
 */
export const jobTable = sqliteTable(
  'job',
  {
    id: uuidPrimaryKeyOrdered(),
    type: text().notNull(),
    status: text().notNull(),
    priority: integer().notNull().default(0),
    queue: text().notNull(),
    idempotencyKey: text(),
    scheduledAt: integer().notNull(),
    startedAt: integer(),
    finishedAt: integer(),
    attempt: integer().notNull().default(0),
    maxAttempts: integer().notNull().default(3),
    input: text({ mode: 'json' }).$type<unknown>().notNull(),
    output: text({ mode: 'json' }).$type<unknown>(),
    error: text({ mode: 'json' }).$type<JobError>(),
    parentId: text(),
    cancelRequested: integer({ mode: 'boolean' }).notNull().default(false),
    metadata: text({ mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
    timeoutMs: integer(),
    ...createUpdateTimestamps,
  },
  (t) => [
    check(
      'job_status_check',
      sql`${t.status} IN ('pending','delayed','running','completed','failed','cancelled')`,
    ),
    index('job_queue_status_scheduled_at_idx').on(t.queue, t.status, t.scheduledAt),
    index('job_status_idx').on(t.status),
    index('job_parent_id_idx').on(t.parentId),
    uniqueIndex('job_idempotency_key_partial_uq')
      .on(t.idempotencyKey)
      .where(
        sql`${t.idempotencyKey} IS NOT NULL AND ${t.status} NOT IN ('completed','failed','cancelled')`,
      ),
    foreignKey({
      columns: [t.parentId],
      foreignColumns: [t.id],
    }).onDelete('set null'),
  ],
);

export type JobRow = typeof jobTable.$inferSelect;
export type InsertJobRow = typeof jobTable.$inferInsert;
