import type { ChatTarget } from '@/frontend/appShell/navigation/chat';
import { useAgentApiById, useAgentSession } from '@/frontend/hooks/agent';
import type { Agent } from '@/shared/data/types/agent';

/** The reference arrives with its document attached; minimal Agents accept only text and images. */
export const acceptsSelection = (agent: Agent) => agent.mode === 'standard';

/**
 * Whether an Office selection, or another handoff the Agent `accepts`, returns to the chat that
 * opened the preview. A chat whose Agent cannot use it, or no longer exists, does not take it.
 */
export function useSelectionSourceChat(
  sourceChat: ChatTarget | undefined,
  accepts: (agent: Agent) => boolean = acceptsSelection,
) {
  const session = useAgentSession(
    sourceChat?.kind === 'session' ? sourceChat.sessionId : undefined,
  );
  const agentQuery = useAgentApiById(
    sourceChat?.kind === 'draft' ? sourceChat.agentId : session.data?.agentId,
  );
  const agent = agentQuery.agent;
  // Until the Agent is known, the source chat holds the action rather than flashing the menu.
  const isResolving = Boolean(sourceChat) && !agent && (session.isLoading || agentQuery.isLoading);

  return {
    isResolving,
    returnsToSourceChat: isResolving || Boolean(sourceChat && agent && accepts(agent)),
  };
}
