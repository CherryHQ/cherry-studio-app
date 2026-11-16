import * as z from 'zod';

import {
  type AgentGlobalSkillService,
  encodeSkillCursor,
} from '@/backend/data/services/AgentGlobalSkillService';
import { SKILL_SEARCH_MAX_LENGTH } from '@/shared/data/api/schemas/skills';

import type { RuntimeTool } from '../../runtime';
import { toRuntimeInputSchema } from '../runtimeToolSchema';

export const SKILL_INVENTORY_MAX_CHARACTERS = 12_000;

const inputSchema = z.strictObject({
  mode: z.enum(['list', 'count']).default('list'),
  search: z.string().trim().max(SKILL_SEARCH_MAX_LENGTH).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  include_descriptions: z.boolean().default(false),
});

/** Library metadata is discoverable without granting access to package instructions. */
export function createSkillInventoryTool(
  library: Pick<AgentGlobalSkillService, 'list' | 'countLibrary'>,
  agentId?: string,
): RuntimeTool {
  return {
    ref: { source: 'builtin', capabilityId: 'list_installed_skills' },
    providerName: 'list_installed_skills',
    displayName: 'List installed Skills',
    deferred: true,
    approval: 'auto',
    description:
      'Inspect all Skills installed in this Cherry app, including globally disabled and unbound Skills. Use mode=count for a total without listing entries; search matches name or description in both modes. Lists default to 20 compact entries; include_descriptions adds complete descriptions. Each list reply is capped at 12,000 serialized characters and may return fewer than limit. Follow nextCursor with the same search and options until null for a complete list. Enablement, Agent binding and invocation flags are configuration facts, not execution support. Listing never binds, enables or loads instructions; load_skill still requires access in this Agent.',
    inputSchema: toRuntimeInputSchema(inputSchema),
    async execute({ input, signal }) {
      const { mode, search, cursor, limit, include_descriptions } = inputSchema.parse(input);
      signal.throwIfAborted();
      if (mode === 'count') {
        const total = await library.countLibrary(search);
        signal.throwIfAborted();
        return { value: { total }, artifacts: [] };
      }
      const page = await library.list({ search, cursor, limit, scope: 'library', agentId });
      signal.throwIfAborted();
      const items = page.items.map(({ skill, binding }) => ({
        skill_id: skill.id,
        name: skill.name,
        ...(include_descriptions ? { description: skill.description } : {}),
        globallyEnabled: skill.isEnabled,
        agentBinding: agentId
          ? binding
            ? binding.isEnabled
              ? 'enabled'
              : 'disabled'
            : 'unbound'
          : null,
        invocation: skill.invocation,
      }));
      const skills: typeof items = [];
      let nextCursor: string | null = null;
      for (const [index, item] of items.entries()) {
        const candidate = {
          returned: skills.length + 1,
          skills: [...skills, item],
          nextCursor:
            index < items.length - 1
              ? encodeSkillCursor(page.items[index].skill)
              : (page.nextCursor ?? null),
        };
        // One schema-bounded entry always fits, including a complete description.
        if (JSON.stringify(candidate).length > SKILL_INVENTORY_MAX_CHARACTERS) break;
        skills.push(item);
        nextCursor = candidate.nextCursor;
      }
      return {
        value: {
          returned: skills.length,
          skills,
          nextCursor,
        },
        artifacts: [],
      };
    },
  };
}
