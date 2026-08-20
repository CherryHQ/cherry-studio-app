import type { Assistant, McpMode } from '@cherrystudio/universal/data/types/assistant';
import type { McpServer } from '@cherrystudio/universal/data/types/mcpServer';

/**
 * Effective MCP mode for an assistant, ported from desktop
 * `resolveAssistantMcpTools.ts`: an explicit `settings.mcpMode` wins; without
 * one, having selected servers implies `manual`, otherwise `disabled`.
 */
export function getEffectiveMcpMode(assistant: Assistant): McpMode {
  if (assistant.settings.mcpMode) {
    return assistant.settings.mcpMode;
  }
  return assistant.mcpServerIds.length > 0 ? 'manual' : 'disabled';
}

/**
 * Servers whose tools this assistant should receive.
 * `auto` → all enabled servers; `manual` → enabled ∩ selected; `disabled` → none.
 * Dangling `mcpServerIds` (deleted servers) drop out of the intersection.
 */
export function resolveServersForAssistant(
  assistant: Assistant,
  enabledServers: McpServer[],
): McpServer[] {
  const mode = getEffectiveMcpMode(assistant);

  if (mode === 'disabled') {
    return [];
  }

  if (mode === 'auto') {
    return enabledServers;
  }

  const selectedIds = new Set(assistant.mcpServerIds);
  return enabledServers.filter((server) => selectedIds.has(server.id));
}
