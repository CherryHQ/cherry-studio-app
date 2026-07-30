import type { Assistant, McpMode } from '@/shared/domain/assistant';
import type { StreamableHttpMcpServer } from '@/shared/domain/mcpServer';

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
 * `auto` → all active servers; `manual` → active ∩ selected; `disabled` → none.
 * Dangling `mcpServerIds` (deleted servers) drop out of the intersection.
 */
export function resolveServersForAssistant(
  assistant: Assistant,
  activeServers: StreamableHttpMcpServer[],
): StreamableHttpMcpServer[] {
  const mode = getEffectiveMcpMode(assistant);

  if (mode === 'disabled') {
    return [];
  }

  if (mode === 'auto') {
    return activeServers;
  }

  const selectedIds = new Set(assistant.mcpServerIds);
  return activeServers.filter((server) => selectedIds.has(server.id));
}
