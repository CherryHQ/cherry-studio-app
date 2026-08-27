/**
 * Jobs domain API Schema definitions.
 *
 * Entity schemas live here (Rule C/D in api/README.md): field atoms,
 * `RetryPolicy`, and the `JobSnapshot` that both the DataApi response and the
 * frontend `useJob` hook consume.
 *
 * NOTE: Handler runtime types (JobHandler / JobContext / JobSettledEvent) are
 * NOT here — they belong to the backend runtime at
 * `src/backend/services/jobs/types.ts`. The frontend never instantiates them.
 */

import * as z from 'zod';

// ============================================================================
// Field atoms
// ============================================================================

export const JobStatusAtomSchema = z.enum([
  'pending',
  'delayed',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export type JobStatus = z.infer<typeof JobStatusAtomSchema>;

/** Terminal states: jobs in these states are finished and never resume. */
export const TERMINAL_JOB_STATUSES = [
  'completed',
  'failed',
  'cancelled',
] as const satisfies readonly JobStatus[];

/** Active (non-terminal) states: jobs in these states are queued, waiting, or executing. */
export const ACTIVE_JOB_STATUSES = [
  'pending',
  'delayed',
  'running',
] as const satisfies readonly JobStatus[];

export const isTerminalStatus = (status: JobStatus): boolean =>
  (TERMINAL_JOB_STATUSES as readonly JobStatus[]).includes(status);

/**
 * Stable error structure persisted on the job row. `code` is an English
 * constant; the frontend maps it to a localized message via
 * `t(\`errors.jobs.${code.toLowerCase()}\`, params)`.
 */
export const JobErrorSchema = z.strictObject({
  code: z.string(),
  message: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
  retryable: z.boolean(),
});
export type JobError = z.infer<typeof JobErrorSchema>;

// ============================================================================
// RetryPolicy
// ============================================================================

export const RetryPolicySchema = z.strictObject({
  maxAttempts: z.number().int().min(1),
  backoff: z.enum(['exponential', 'fixed', 'none']),
  baseDelayMs: z.number().int().min(0),
  maxDelayMs: z.number().int().min(0),
});
export type RetryPolicy = z.infer<typeof RetryPolicySchema>;

// ============================================================================
// Job entity (frontend-visible snapshot)
// ============================================================================

export const JobSnapshotSchema = z.strictObject({
  id: z.string(),
  type: z.string(),
  status: JobStatusAtomSchema,
  priority: z.number().int(),
  queue: z.string(),
  idempotencyKey: z.string().nullable(),
  scheduledAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  attempt: z.number().int().min(0),
  maxAttempts: z.number().int().min(1),
  input: z.unknown(),
  output: z.unknown().nullable(),
  error: JobErrorSchema.nullable(),
  parentId: z.string().nullable(),
  cancelRequested: z.boolean(),
  metadata: z.record(z.string(), z.unknown()),
  timeoutMs: z.number().int().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type JobSnapshot = z.infer<typeof JobSnapshotSchema>;

// ============================================================================
// JobProgress (cache value at jobs.progress.${id}, never DB-persisted)
// ============================================================================

export const JobProgressSchema = z.strictObject({
  progress: z.number().min(0).max(100),
  detail: z.unknown().optional(),
});
export type JobProgress = z.infer<typeof JobProgressSchema>;

// ============================================================================
// Error codes (constants for JobRuntime + DataApi handler + frontend i18n)
// ============================================================================

export const JOB_ERROR_CODES = {
  UNKNOWN_TYPE: 'JOB_UNKNOWN_TYPE',
  PAYLOAD_TOO_LARGE: 'JOB_PAYLOAD_TOO_LARGE',
  CANCEL_REASON_TOO_LONG: 'JOB_CANCEL_REASON_TOO_LONG',
  HANDLER_TIMEOUT: 'JOB_HANDLER_TIMEOUT',
  HANDLER_THREW: 'JOB_HANDLER_THREW',
  CANCELLED: 'JOB_CANCELLED',
} as const;
export type JobErrorCode = (typeof JOB_ERROR_CODES)[keyof typeof JOB_ERROR_CODES];

// ============================================================================
// API endpoint schemas
// ============================================================================

/**
 * Comma-separated status filter, e.g. `?status=pending,running`. Empty string
 * decays to undefined (no filter). Validation rejects unknown status values
 * up-front so the handler does not silently drop them.
 */
const StatusListQuerySchema = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (!value) return undefined;
    const parts = value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return undefined;
    const out: JobStatus[] = [];
    for (const part of parts) {
      const parsed = JobStatusAtomSchema.safeParse(part);
      if (!parsed.success) {
        ctx.addIssue({ code: 'custom', message: `invalid status value: ${part}` });
        return z.NEVER;
      }
      out.push(parsed.data);
    }
    return out;
  });

export const ListJobsQuerySchema = z.strictObject({
  status: StatusListQuerySchema,
  queue: z.string().optional(),
  type: z.string().optional(),
  parentId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
/** Input shape (URL query strings). Use {@link ListJobsQuerySchema} to parse. */
export type ListJobsQueryParams = z.input<typeof ListJobsQuerySchema>;

export type JobSchemas = {
  '/jobs': {
    /** List jobs, ordered by createdAt DESC. Supports status/queue/type/parentId filters and pagination. */
    GET: {
      query?: ListJobsQueryParams;
      response: JobSnapshot[];
    };
  };
  '/jobs/:id': {
    /** Fetch a single job snapshot. 404 if id does not exist. */
    GET: {
      params: { id: string };
      response: JobSnapshot;
    };
  };
};
