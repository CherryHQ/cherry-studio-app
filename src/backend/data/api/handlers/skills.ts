import type { AgentGlobalSkillService } from '@/backend/data/services/AgentGlobalSkillService';
import { DataApiErrorFactory, toDataApiError } from '@/shared/data/api/errors';
import { ListSkillsQuerySchema, type SkillSchemas } from '@/shared/data/api/schemas/skills';
import type { HandlersFor } from '@/shared/data/api/types';

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
