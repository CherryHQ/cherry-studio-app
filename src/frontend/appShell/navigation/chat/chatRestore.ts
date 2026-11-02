import type { ChatTarget } from './chatRoute';

export type ChatRestoreState =
  | { status: 'empty' }
  | { error: Error; status: 'error' }
  | { status: 'loading' }
  | { status: 'ready'; target: Extract<ChatTarget, { kind: 'draft' }> };

type AgentReadState = {
  error?: Error;
  isLoading: boolean;
  items: readonly { id: string }[];
};

export function resolveChatRestoreState({
  agents,
  lastAgent,
}: {
  agents: AgentReadState;
  lastAgent?: AgentReadState;
}): ChatRestoreState {
  // Only a successful, empty ID lookup allows the fallback list to choose an Agent.
  const source =
    lastAgent && (lastAgent.isLoading || lastAgent.error || lastAgent.items.length > 0)
      ? lastAgent
      : agents;
  if (source.isLoading) {
    return { status: 'loading' };
  }
  if (source.error) {
    return { error: source.error, status: 'error' };
  }

  const agent = source.items[0];
  return agent
    ? { status: 'ready', target: { agentId: agent.id, kind: 'draft' } }
    : { status: 'empty' };
}
