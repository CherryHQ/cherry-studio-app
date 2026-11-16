import * as z from 'zod';

import type { AgentGlobalSkillService } from '@/backend/data/services/AgentGlobalSkillService';
import { SKILL_SEARCH_MAX_LENGTH } from '@/shared/data/api/schemas/skills';

import type { RuntimeTool } from '../../runtime';
import { toRuntimeInputSchema } from '../runtimeToolSchema';

const inputSchema = z.strictObject({
  search: z.string().trim().max(SKILL_SEARCH_MAX_LENGTH).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

/** Library metadata is discoverable without granting access to package instructions. */
export function createSkillInventoryTool(
  library: Pick<AgentGlobalSkillService, 'list'>,
  agentId?: string,
): RuntimeTool {
  return {
    ref: { source: 'builtin', capabilityId: 'list_installed_skills' },
    providerName: 'list_installed_skills',
    displayName: 'List installed Skills',
    deferred: true,
    approval: 'auto',
    description:
      'List all Skills installed in this Cherry app, including globally disabled Skills and Skills not bound to the current Agent. Optional search matches name or description. Follow nextCursor with the same search until null before reporting a complete list or count. Global enablement, current Agent binding and invocation flags are configuration facts, not proof a Skill can execute. Listing never binds, enables or loads instructions. Use agent_update only when asked to change bindings; load_skill still requires the Skill to be available to this Agent.',
    inputSchema: toRuntimeInputSchema(inputSchema),
    async execute({ input, signal }) {
      const parsed = inputSchema.parse(input);
      signal.throwIfAborted();
      const page = await library.list({ ...parsed, scope: 'library', agentId });
      signal.throwIfAborted();
      return {
        value: {
          returned: page.items.length,
          skills: page.items.map(({ skill, binding }) => ({
            skill_id: skill.id,
            name: skill.name,
            description: skill.description,
            version: skill.version,
            globallyEnabled: skill.isEnabled,
            agentBinding: agentId
              ? binding
                ? binding.isEnabled
                  ? 'enabled'
                  : 'disabled'
                : 'unbound'
              : null,
            invocation: skill.invocation,
          })),
          nextCursor: page.nextCursor ?? null,
        },
        artifacts: [],
      };
    },
  };
}
