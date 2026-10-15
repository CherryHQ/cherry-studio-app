import type { McpPromptEntry } from '@/shared/contracts/mcp';
import type { AgentToolBinding } from '@/shared/data/types/agentToolBinding';
import type { McpServer } from '@/shared/data/types/mcpServer';

export type ChatInputMcpPrompt = {
  serverId: string;
  serverName: string;
  prompt: McpPromptEntry;
};

/** A per-tool override does not enable a server's prompts for the Agent. */
export function getChatInputMcpPrompts(
  servers: readonly McpServer[],
  bindings: readonly AgentToolBinding[],
  catalogs: Readonly<Record<string, readonly McpPromptEntry[]>>,
): ChatInputMcpPrompt[] {
  const enabledServerIds = new Set(
    bindings
      .filter((binding) => binding.enabled && !binding.rawToolName && binding.approval !== 'deny')
      .map((binding) => binding.serverId),
  );
  return servers.flatMap((server) =>
    server.isEnabled && server.origin !== 'builtin' && enabledServerIds.has(server.id)
      ? (catalogs[server.id] ?? []).map((prompt) => ({
          serverId: server.id,
          serverName: server.name,
          prompt,
        }))
      : [],
  );
}
