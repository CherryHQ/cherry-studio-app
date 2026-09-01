import type { ChatTarget } from './chatRoute';

export type ChatRestoreState =
  | { status: 'empty' }
  | { error: Error; status: 'error' }
  | { status: 'loading' }
  | { status: 'ready'; target: ChatTarget };

export function resolveChatRestoreState({
  agents,
  latestSession,
}: {
  agents: { error?: Error; isLoading: boolean; items: readonly { id: string }[] };
  latestSession: { error?: Error; isLoading: boolean; session?: { id: string } };
}): ChatRestoreState {
  if (latestSession.isLoading) {
    return { status: 'loading' };
  }
  if (latestSession.error) {
    return { error: latestSession.error, status: 'error' };
  }
  if (latestSession.session) {
    return {
      status: 'ready',
      target: { kind: 'session', sessionId: latestSession.session.id },
    };
  }

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
