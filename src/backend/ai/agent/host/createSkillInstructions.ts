import type { RuntimeTool } from '../runtime';
import { RUN_JS_TOOL_NAME } from '../tools/runJsTool';

/** App-owned authoring guidance grounded in this turn's actual tool catalog. */
export function buildCreateSkillInstructions(tools: readonly RuntimeTool[]): string {
  const builtIns = tools.filter(
    (tool) => tool.ref.source === 'builtin' && tool.approval !== 'deny',
  );
  const names = builtIns
    .filter((tool) => tool.providerName !== RUN_JS_TOOL_NAME)
    .map((tool) => tool.providerName);
  const hasJavaScript = builtIns.some((tool) => tool.providerName === RUN_JS_TOOL_NAME);
  return `## Create Skills

When the user asks to create a reusable Skill or turn a conversation workflow into one, generate it and save it with create_skill. A discussion or a prompt-only draft is not a request to save.

- Reuse relevant context and the user's working examples, corrections and output preferences. Ask concise questions only when essential inputs, expected output or constraints are missing. Replace one-off facts and private material with runtime inputs unless the user wants them retained. Never embed credentials or claim to have read unavailable history.
- Follow the Agent Skills format: a short lowercase hyphenated name; a description stating what the Skill does and when to use it; and a focused Markdown instruction body with concrete steps, input handling, output format, a useful example and checks appropriate to the task. Prefer one clear procedure over a menu of alternatives. Avoid generic advice and keep the body within 24,000 Unicode characters.
- These Skills target Cherry Studio App. For tool-based workflows, use the current tool descriptions and input schemas to design executable steps: resolve live IDs and inputs, call the exact tool, consume its result, and handle missing configuration or failure honestly. Do not invent shell access, desktop paths, package script execution, tools or APIs. Do not perform external writes just to test a proposed workflow.
- In create_skill, list only the tools the workflow actually uses in allowedTools, using their model-facing names. Include concise relevant tags. Put additional requirements such as iOS, configured providers, OS permissions or connected plugins in compatibility; the app adds its Cherry Studio App environment statement. Supply license only if the user specified one. The app writes metadata.author from the current user and metadata.version as 1.0.
- Pass the complete body without YAML frontmatter. The app serializes standard frontmatter and saves one SKILL.md. Keep short examples and templates inline; do not refer to supporting files that this call does not create. Report success only after the tool confirms it, then tell the user it is available in the Skill library. Do not claim the generated workflow has been tested.
- Creation does not bind the Skill to any Agent or activate it. Use agent_update for bindings only if the user asks. When the Skill is later used, its instructions can call that turn's available tools through the existing execution and approval system; allowed-tools grants no tools or permissions. If a required tool is unavailable, explain the needed setup instead of claiming success.

Cherry built-in tools offered in this turn: ${names.join(', ') || '(none)'}. Their current definitions, not this name list, specify arguments and behavior.${hasJavaScript ? '\nJavaScript execution is also available through the offered Code Mode tool. Use its actual model-facing name and environment contract; run_js is an internal capability identifier, not a callable model tool. Its working data is temporary; persist lasting outputs with file tools.' : ''}
For MCP/plugin workflows, use the existing tool discovery mechanism to inspect the required tool definitions before authoring. Record the required plugin or service in compatibility and explain how to discover its tools when the Skill runs; never bake in account credentials, ephemeral resource IDs or guessed tool names.`;
}
