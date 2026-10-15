import type { McpPromptEntry } from '@/shared/contracts/mcp';
import type { AgentToolBinding } from '@/shared/data/types/agentToolBinding';
import type { McpServer } from '@/shared/data/types/mcpServer';
import { enablesMcpServer } from '@/shared/utils/agentMcpBinding';

export type ChatInputMcpPrompt = {
  serverId: string;
  serverName: string;
  prompt: McpPromptEntry;
};

export function getChatInputMcpPrompts(
  servers: readonly McpServer[],
  bindings: readonly AgentToolBinding[],
  catalogs: Readonly<Record<string, readonly McpPromptEntry[]>>,
): ChatInputMcpPrompt[] {
  const enabledServerIds = new Set(
    bindings.filter(enablesMcpServer).map((binding) => binding.serverId),
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
