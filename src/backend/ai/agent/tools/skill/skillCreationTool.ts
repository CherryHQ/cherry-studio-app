import { SkillsError, type SkillsModule } from '@/shared/contracts/skills';
import { CreateSkillInputSchema } from '@/shared/data/types/skill';

import type { RuntimeTool, RuntimeToolResult } from '../../runtime';
import { toRuntimeInputSchema } from '../runtimeToolSchema';

export function createSkillCreationTool(workflow: Pick<SkillsModule, 'create'>): RuntimeTool {
  return {
    ref: { source: 'builtin', capabilityId: 'create_skill' },
    providerName: 'create_skill',
    displayName: 'Create Skill',
    approval: 'ask',
    description:
      'Create and save one reusable Skill in the library. Provide a lowercase hyphenated name, trigger description and complete Markdown instructions (body only, no YAML). Include the workflow’s actual tool names in allowedTools, relevant tags, any additional environment requirements in compatibility, and a license only if supplied by the user. Use the tool definitions offered in this turn, including discovery for plugin tools; never invent tools. The app records the current user as author, initial version 1.0, and the Cherry Studio App environment. Creates only SKILL.md; does not bind it to an Agent or add tools or permissions. Do not save prompt-only drafts, embed credentials or repeat a successful create. Only use agent_update to bind a Skill when the user requests it.',
    inputSchema: toRuntimeInputSchema(CreateSkillInputSchema),
    async execute(call): Promise<RuntimeToolResult> {
      try {
        call.signal.throwIfAborted();
        const skill = await workflow.create(CreateSkillInputSchema.parse(call.input), call.signal);
        return {
          value: { status: 'created', skill_id: skill.id, name: skill.name },
          artifacts: [],
        };
      } catch (error) {
        call.signal.throwIfAborted();
        return {
          value: {
            status: 'error',
            code: error instanceof SkillsError ? error.code : 'creation-failed',
            message:
              error instanceof SkillsError
                ? error.message
                : 'Creation could not be confirmed. Check the Skill library before retrying.',
          },
          artifacts: [],
        };
      }
    },
  };
}
