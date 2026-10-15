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
} from '@/shared/data/api/schemas/skills';
import type { HandlersFor } from '@/shared/data/api/types';
import type { Skill, SkillLimitations, SkillListItem } from '@/shared/data/types/skill';

type SkillData = Pick<
  AgentGlobalSkillService,
  'getById' | 'list' | 'listBindings' | 'replaceBindings'
>;

/**
 * What the Skills workflow owner knows beyond the row: whether the accepted
 * bytes are on disk, and which part of the stored profile the app does not
 * provide. Declared structurally because this layer must not import
 * `backend/services`. Neither answer performs I/O beyond a storage lookup.
 */
export type SkillAvailabilityReader = {
  read(skill: Skill): { isPackageMissing: boolean; limitations: SkillLimitations };
};

/** Reads an immutable app-managed package revision without exposing device paths. */
export type SkillInstructionReader = {
  read(skill: Skill): Promise<string | null>;
};

export function createSkillHandlers(
  service: SkillData,
  availability: SkillAvailabilityReader,
  instructions: SkillInstructionReader,
): HandlersFor<SkillSchemas> {
  function project(
    entries: readonly { skill: Skill; binding: { isEnabled: boolean } | null }[],
    agentId?: string,
  ): SkillListItem[] {
    return entries.map((entry) => ({
      ...entry.skill,
      ...availability.read(entry.skill),
      ...(agentId
        ? { binding: entry.binding ? { isEnabled: entry.binding.isEnabled } : null }
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
          // Missing packages cannot be read. Limitations must not hide
          // otherwise accessible instructions from the composer.
          do {
            const page = await service.list({ ...parsed.data, cursor, limit: 200 });
            items.push(
              ...project(page.items, parsed.data.agentId).filter((item) => !item.isPackageMissing),
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
          items: project(page.items, parsed.data.agentId),
          ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
        };
      },
    },
    '/skills/:skillId': {
      GET: async ({ params }) => {
        const skill = await service.getById(params.skillId);
        const [item] = project([{ skill, binding: null }]);
        return item!;
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
        return { items: project(entries, params.agentId) };
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
