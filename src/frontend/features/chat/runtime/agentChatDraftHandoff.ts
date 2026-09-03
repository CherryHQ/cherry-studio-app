export type AgentChatDraftHandoff = Readonly<{
  agentId: string;
  sessionId: string;
}>;

type OpenSession = (sessionId: string) => void;

/** Owns the one pending Draft-to-Session handoff for a chat route. */
export function createAgentChatDraftHandoffState() {
  let pending: AgentChatDraftHandoff | undefined;

  return {
    complete(sessionId: string) {
      if (pending?.sessionId === sessionId) {
        pending = undefined;
      }
    },
    get(sessionId: string | undefined) {
      return sessionId && pending?.sessionId === sessionId ? pending : undefined;
    },
    handoffToSession(handoff: AgentChatDraftHandoff, openSession: OpenSession) {
      pending = handoff;
      openSession(handoff.sessionId);
    },
  };
}
