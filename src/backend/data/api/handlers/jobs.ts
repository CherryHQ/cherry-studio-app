import type { JobService } from '@/backend/data/services/JobService';
import { DataApiErrorFactory } from '@cherrystudio/universal/data/api/errors';
import {
  type JobSchemas,
  ListJobsQuerySchema,
} from '@cherrystudio/universal/data/api/schemas/jobs';
import type { HandlersFor } from '@cherrystudio/universal/data/api/types';

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
