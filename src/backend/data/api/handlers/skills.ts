import {
  encodeSkillCursor,
  type AgentGlobalSkillService,
} from '@/backend/data/services/AgentGlobalSkillService';
import { DataApiErrorFactory, toDataApiError } from '@/shared/data/api/errors';
import {
  ListSkillsQuerySchema,
  ReplaceAgentSkillsSchema,
  type SkillSchemas,
  SkillInstructionsResponseSchema,
  UpdateSkillSchema,
} from '@/shared/data/api/schemas/skills';
import type { HandlersFor } from '@/shared/data/api/types';
import type { Skill, SkillAdmission, SkillListItem } from '@/shared/data/types/skill';

type SkillData = Pick<
  AgentGlobalSkillService,
  'getById' | 'list' | 'listBindings' | 'replaceBindings' | 'update'
>;

/**
 * Derives current availability for installed Skills. Declared structurally:
 * the implementation reads capability owners under `backend/services`, which
 * this layer must not import. Results are per read and never persisted.
 */
export type SkillAdmissionReader = {
  evaluate(
    skills: readonly Skill[],
    agentId?: string,
  ): Promise<{ admission: SkillAdmission; agentAdmission?: SkillAdmission }[]>;
};

/** Reads an immutable app-managed package revision without exposing device paths. */
export type SkillInstructionReader = {
  read(skill: Skill): Promise<string | null>;
};

export function createSkillHandlers(
  service: SkillData,
  admissions: SkillAdmissionReader,
  instructions: SkillInstructionReader,
): HandlersFor<SkillSchemas> {
  async function project(
    entries: readonly { skill: Skill; binding: { isEnabled: boolean } | null }[],
    agentId?: string,
  ): Promise<SkillListItem[]> {
    const evaluated = await admissions.evaluate(
      entries.map((entry) => entry.skill),
      agentId,
    );
    return entries.map((entry, index) => ({
      ...entry.skill,
      admission: evaluated[index]!.admission,
      ...(agentId
        ? {
            binding: entry.binding ? { isEnabled: entry.binding.isEnabled } : null,
            agentAdmission: evaluated[index]!.agentAdmission,
          }
        : {}),
    }));
  }

  return {
    '/skills': {
      GET: async ({ query }) => {
        const parsed = ListSkillsQuerySchema.safeParse(query ?? {});
        if (!parsed.success) {
          throw toDataApiError(parsed.error, 'Skill list');
        }
        if (parsed.data.scope === 'composer') {
          const items: SkillListItem[] = [];
          let cursor = parsed.data.cursor;
          // Missing packages cannot be read. Environment guidance must not hide
          // otherwise accessible instructions from the composer.
          do {
            const page = await service.list({ ...parsed.data, cursor, limit: 200 });
            items.push(
              ...(await project(page.items, parsed.data.agentId)).filter(
                (item) =>
                  !item.admission.reasons.some(({ code }) => code === 'package-unavailable'),
              ),
            );
            cursor = page.nextCursor;
          } while (cursor && items.length <= parsed.data.limit);
          const page = items.slice(0, parsed.data.limit);
          return {
            items: page,
            ...(items.length > page.length
              ? { nextCursor: encodeSkillCursor(page[page.length - 1]!) }
              : {}),
          };
        }
        const page = await service.list(parsed.data);
        return {
          items: await project(page.items, parsed.data.agentId),
          ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
        };
      },
    },
    '/skills/:skillId': {
      GET: async ({ params }) => {
        const skill = await service.getById(params.skillId);
        const [item] = await project([{ skill, binding: null }]);
        return item!;
      },
      PATCH: async ({ body, params }) => {
        const parsed = UpdateSkillSchema.safeParse(body);
        if (!parsed.success) {
          throw toDataApiError(parsed.error, 'Skill update');
        }
        return service.update(params.skillId, parsed.data);
      },
    },
    '/skills/:skillId/instructions': {
      GET: async ({ params }) => {
        const skill = await service.getById(params.skillId);
        const body = await instructions.read(skill);
        if (body === null) throw DataApiErrorFactory.notFound('Skill instructions', skill.id);
        return SkillInstructionsResponseSchema.parse({
          skillId: skill.id,
          name: skill.name,
          contentHash: skill.contentHash,
          instructions: body,
        });
      },
    },
    '/agents/:agentId/skills': {
      GET: async ({ params }) => {
        const entries: Parameters<typeof project>[0][number][] = [];
        let cursor: string | undefined;
        do {
          const page = await service.list({
            agentId: params.agentId,
            scope: 'agent',
            limit: 200,
            cursor,
          });
          entries.push(...page.items);
          cursor = page.nextCursor;
        } while (cursor);
        return { items: await project(entries, params.agentId) };
      },
      PUT: async ({ body, params }) => {
        const parsed = ReplaceAgentSkillsSchema.safeParse(body);
        if (!parsed.success) {
          throw toDataApiError(parsed.error, 'Agent skill binding replace');
        }
        return service.replaceBindings(params.agentId, parsed.data);
      },
    },
  };
}
