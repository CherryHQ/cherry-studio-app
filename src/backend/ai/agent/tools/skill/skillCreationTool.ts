import { SkillsError, type SkillsModule } from '@/shared/contracts/skills';
import { CreateSkillInputSchema } from '@/shared/data/types/skill';

import type { RuntimeTool, RuntimeToolResult } from '../../runtime';
import { toRuntimeInputSchema } from '../runtimeToolSchema';

/** The complete authoring guidance travels with the tool, so it costs context only once the tool is loaded. */
const CREATE_SKILL_DESCRIPTION = `Create and save one reusable Skill in the library when the user asks to create a Skill or turn a conversation workflow into one. A discussion or a prompt-only draft is not a request to save.

- Reuse relevant context and the user's working examples, corrections and output preferences. Ask concise questions only when essential inputs, expected output or constraints are missing. Replace one-off facts and private material with runtime inputs unless the user wants them retained. Never embed credentials or claim to have read unavailable history.
- Follow the Agent Skills format: a short lowercase hyphenated name; a description stating what the Skill does and when to use it; and a focused Markdown instruction body with concrete steps, input handling, output format, a useful example and checks appropriate to the task. Prefer one clear procedure over a menu of alternatives. Avoid generic advice and keep the body within 24,000 Unicode characters.
- These Skills target Cherry Studio App. For tool-based workflows, use the current tool descriptions and input schemas, including tools loaded through discovery, to design executable steps: resolve live IDs and inputs, call the exact tool, consume its result, and handle missing configuration or failure honestly. Do not invent shell access, desktop paths, package script execution, tools or APIs. Do not perform external writes just to test a proposed workflow.
- JavaScript steps use the offered Code Mode tool by its model-facing name; run_js is an internal capability identifier, not a callable model tool. Code Mode working data is temporary; persist lasting outputs with file tools.
- For MCP/plugin workflows, inspect the required tool definitions through discovery before authoring. Record the required plugin or service in compatibility and explain how to discover its tools when the Skill runs; never bake in account credentials, ephemeral resource IDs or guessed tool names.
- List only the tools the workflow actually uses in allowedTools, using their model-facing names. Include concise relevant tags. Put additional requirements such as iOS, configured providers, OS permissions or connected plugins in compatibility; the app adds its Cherry Studio App environment statement. Supply license only if the user specified one. The app writes metadata.author from the current user and metadata.version as 1.0.
- Pass the complete body without YAML frontmatter. The app serializes standard frontmatter and saves one SKILL.md. Keep short examples and templates inline; do not refer to supporting files that this call does not create. Report success only after the tool confirms it, then tell the user it is available in the Skill library. Do not repeat a successful create or claim the generated workflow has been tested.
- Creation does not bind the Skill to any Agent or activate it. Use agent_update for bindings only if the user asks. When the Skill is later used, its instructions can call that turn's available tools through the existing execution and approval system; allowed-tools grants no tools or permissions. If a required tool is unavailable, explain the needed setup instead of claiming success.`;

/** Deferred unless the user explicitly chose the create-skill workflow for this turn. */
export function createSkillCreationTool(
  workflow: Pick<SkillsModule, 'create'>,
  options: { deferred?: boolean } = {},
): RuntimeTool {
  return {
    ref: { source: 'builtin', capabilityId: 'create_skill' },
    providerName: 'create_skill',
    displayName: 'Create Skill',
    approval: 'ask',
    description: CREATE_SKILL_DESCRIPTION,
    deferred: options.deferred,
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
