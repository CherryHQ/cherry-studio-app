import {
  TeamAgentError,
  teamDraftKey,
  type TeamAgentModule,
  type TeamSession,
  type TeamSubmitResult,
} from '@/shared/contracts/teamAgent';

export type StartTeamSessionResult = {
  session: TeamSession;
  status: TeamSubmitResult;
};

/**
 * Creates a Team session on the user's first send and delivers the initial prompt inside that
 * session so agent browsing alone never creates empty server sessions.
 */
export async function startTeamSessionAndSend({
  module,
  contextKey,
  agentId,
  text,
  draftKey,
  onSessionCreated,
}: {
  module: TeamAgentModule;
  contextKey: string;
  agentId: string;
  text: string;
  draftKey: string;
  onSessionCreated(session: TeamSession): void;
}): Promise<StartTeamSessionResult> {
  if (module.getState().context?.key !== contextKey) throw new TeamAgentError('retired');
  const created = await module.createSession(agentId);
  if (module.getState().context?.key !== contextKey) throw new TeamAgentError('retired');

  const nextDraftKey = teamDraftKey(contextKey, created);
  const existingDraft = module.readDraft(draftKey);
  module.writeDraft(nextDraftKey, existingDraft || text);
  if (existingDraft) module.writeDraft(draftKey, '');

  const conversation = module.observe(created);
  try {
    try {
      await conversation.refresh();
      const status = await conversation.send(text);
      onSessionCreated(created);
      return { session: created, status };
    } catch (error) {
      if (module.getState().context?.key === contextKey) onSessionCreated(created);
      throw error;
    }
  } finally {
    conversation.dispose();
  }
}
