import type { JobService } from '@/backend/data/services/JobService';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import { type JobSchemas, ListJobsQuerySchema } from '@/shared/data/api/schemas/jobs';
import type { HandlersFor } from '@/shared/data/api/types';

export function createJobHandlers(service: JobService): HandlersFor<JobSchemas> {
  return {
    '/jobs': {
      GET: async ({ query }) => service.list(ListJobsQuerySchema.parse(query ?? {})),
    },
    '/jobs/:id': {
      GET: async ({ params }) => {
        const job = await service.getById(params.id);
        if (!job) throw DataApiErrorFactory.notFound('Job', params.id);
        return job;
      },
    },
  };
}
