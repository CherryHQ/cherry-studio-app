import { ErrorCode, isDataApiError } from '@/shared/data/api/errors';

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

export function isMissingChatAgent(error: unknown): boolean {
  return (
    isDataApiError(error) &&
    error.code === ErrorCode.NOT_FOUND &&
    error.details?.resource === 'Agent'
  );
}

export function resolveChatRestoreState({
  agents,
  lastAgent,
}: {
  agents: AgentReadState;
  lastAgent?: AgentReadState;
}): ChatRestoreState {
  // A pending or failed preferred lookup takes precedence over a cached fallback.
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
