import type { ChatTarget } from './chatRoute';

type SessionIdentity = {
  agentId: string;
  id: string;
};

export type ChatRestoreSessionCandidate = {
  data?: SessionIdentity;
  error?: Error;
  isLoading: boolean;
  isNotFound: boolean;
  sessionId?: string;
};

export type ChatRestoreState =
  | { status: 'empty' }
  | { error: Error; status: 'error' }
  | { status: 'loading' }
  | { status: 'ready'; target: ChatTarget };

export function resolveChatRestoreState({
  agents,
  latestSession,
  requestedSession,
  storedSession,
  storedTarget,
}: {
  agents: { error?: Error; isLoading: boolean; items: readonly { id: string }[] };
  latestSession: { error?: Error; isLoading: boolean; session?: SessionIdentity };
  requestedSession: ChatRestoreSessionCandidate;
  storedSession: ChatRestoreSessionCandidate;
  storedTarget?: ChatTarget;
}): ChatRestoreState {
  const requestedState = resolveSessionCandidate(requestedSession);
  if (requestedState) {
    return requestedState;
  }

  const storedState = resolveSessionCandidate(storedSession);
  if (storedState) {
    return storedState;
  }

  if (latestSession.isLoading) {
    return { status: 'loading' };
  }
  if (latestSession.error) {
    return { error: latestSession.error, status: 'error' };
  }
  if (latestSession.session) {
    return {
      status: 'ready',
      target: {
        agentId: latestSession.session.agentId,
        kind: 'session',
        sessionId: latestSession.session.id,
      },
    };
  }

  if (agents.isLoading) {
    return { status: 'loading' };
  }
  if (agents.error) {
    return { error: agents.error, status: 'error' };
  }

  const storedAgent = storedTarget
    ? agents.items.find((agent) => agent.id === storedTarget.agentId)
    : undefined;
  const agent = storedAgent ?? agents.items[0];
  return agent
    ? { status: 'ready', target: { agentId: agent.id, kind: 'draft' } }
    : { status: 'empty' };
}

function resolveSessionCandidate(query: ChatRestoreSessionCandidate): ChatRestoreState | undefined {
  if (!query.sessionId) {
    return undefined;
  }
  if (query.isLoading) {
    return { status: 'loading' };
  }
  if (query.data) {
    return {
      status: 'ready',
      target: { agentId: query.data.agentId, kind: 'session', sessionId: query.data.id },
    };
  }
  if (query.error && !query.isNotFound) {
    return { error: query.error, status: 'error' };
  }

  return undefined;
}
