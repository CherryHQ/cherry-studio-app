import type { ChatTarget } from './chatRoute';

export type ChatRestoreState =
  | { status: 'empty' }
  | { error: Error; status: 'error' }
  | { status: 'loading' }
  | { status: 'ready'; target: Extract<ChatTarget, { kind: 'draft' }> };

export function resolveChatRestoreState({
  agents,
}: {
  agents: { error?: Error; isLoading: boolean; items: readonly { id: string }[] };
}): ChatRestoreState {
  if (agents.isLoading) {
    return { status: 'loading' };
  }
  if (agents.error) {
    return { error: agents.error, status: 'error' };
  }

  const agent = agents.items[0];
  return agent
    ? { status: 'ready', target: { agentId: agent.id, kind: 'draft' } }
    : { status: 'empty' };
}
