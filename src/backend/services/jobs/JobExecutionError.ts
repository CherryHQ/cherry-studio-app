import { JobErrorSchema, type JobError } from '@/shared/data/api/schemas/jobs';

/** An execution adapter may preserve structured, JSON-safe diagnostics. */
export class JobExecutionError extends Error {
  readonly error: JobError;

  constructor(error: JobError) {
    const parsed = JobErrorSchema.parse(error);
    super(parsed.message);
    this.name = 'JobExecutionError';
    this.error = parsed;
  }
}
