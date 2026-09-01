import type { AgentToolApprovalMode } from '@/shared/data/types/agent';
import type { AgentToolApproval } from '@/shared/data/types/agentToolBinding';

/**
 * The single statement of mobile's interactive tool-approval policy. Every
 * layer that clamps an MCP row or applies the Agent-level approval mode calls
 * these two functions; the composed behavior is:
 *
 *   persisted row -> clampMcpToolApproval -> applyToolApprovalMode -> snapshot
 *
 * so on its own a third-party MCP tool is never `auto`, and the only sanctioned
 * promotion from `ask` to `auto` is the Agent's explicitly confirmed mode.
 */

export type McpInteractiveApproval = Extract<AgentToolApproval, 'ask' | 'deny'>;

/**
 * Approval floor for third-party MCP tools: an explicit deny is preserved and
 * everything else — including a legacy `auto` row — is clamped to ask.
 */
export function clampMcpToolApproval(approval: AgentToolApproval): McpInteractiveApproval {
  return approval === 'deny' ? 'deny' : 'ask';
}

/**
 * Applies an Agent's approval mode to one resolved tool approval. `default`
 * keeps the tool's own value; `auto` promotes only `ask`, and only for tools
 * eligible for promotion — a cost-bearing or permission-gated `ask` states a
 * consent requirement, not an interaction preference. Tool availability,
 * explicit denies, OS permissions, and callback-level resource checks are
 * untouched and continue to fail closed.
 */
export function applyToolApprovalMode(
  approval: AgentToolApproval,
  mode: AgentToolApprovalMode,
  autoApprovalEligible = true,
): AgentToolApproval {
  return mode === 'auto' && approval === 'ask' && autoApprovalEligible ? 'auto' : approval;
}
