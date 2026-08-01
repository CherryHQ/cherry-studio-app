import { DataApiErrorFactory, toDataApiError } from '@cherrystudio/universal/data/api/errors';
import {
  ListSkillsQuerySchema,
  type SkillSchemas,
} from '@cherrystudio/universal/data/api/schemas/skills';
import type { HandlersFor } from '@cherrystudio/universal/data/api/types';

import type { AgentGlobalSkillService } from '@/backend/data/services/AgentGlobalSkillService';

export function createSkillHandlers(service: AgentGlobalSkillService): HandlersFor<SkillSchemas> {
  return {
    '/skills': {
      GET: async ({ query }) => {
        const parsed = ListSkillsQuerySchema.safeParse(query ?? {});
        if (!parsed.success) throw toDataApiError(parsed.error);
        return await service.list(parsed.data);
      },
    },
    '/skills/:skillId': {
      GET: async ({ params }) => {
        const skill = await service.getById(params.skillId);
        if (!skill) throw DataApiErrorFactory.notFound('Skill', params.skillId);
        return skill;
      },
    },
  };
}
