import type { AgentToolBinding } from '@/shared/data/types/agentToolBinding';

/**
 * Whether a binding enables its whole MCP server for the Agent. A per-tool override never does,
 * so server-scoped capabilities such as prompt templates follow only the server-level row.
 */
export function enablesMcpServer(binding: AgentToolBinding): boolean {
  return binding.enabled && !binding.rawToolName && binding.approval !== 'deny';
}
