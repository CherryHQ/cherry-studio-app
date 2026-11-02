import type { ChatTarget } from './chatRoute';

export type ChatRestoreState =
  | { status: 'empty' }
  | { error: Error; status: 'error' }
  | { status: 'loading' }
  | { status: 'ready'; target: Extract<ChatTarget, { kind: 'draft' }> };

export function resolveChatRestoreState({
  agents,
  lastAgentId,
}: {
  agents: { error?: Error; isLoading: boolean; items: readonly { id: string }[] };
  lastAgentId: string | null;
}): ChatRestoreState {
  if (agents.isLoading) {
    return { status: 'loading' };
  }
  if (agents.error) {
    return { error: agents.error, status: 'error' };
  }

  const agent = agents.items.find((item) => item.id === lastAgentId) ?? agents.items[0];
  return agent
    ? { status: 'ready', target: { agentId: agent.id, kind: 'draft' } }
    : { status: 'empty' };
}
