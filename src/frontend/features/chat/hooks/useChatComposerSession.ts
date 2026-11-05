import { useCallback, useState } from 'react';

import type { ChatTarget } from '@/frontend/appShell/navigation/chat';

import type { AgentChatDraftHandoff } from '../runtime/agentChatDraftHandoff';

export type ChatComposerSessionState = Readonly<{
  draftAgentId?: string;
  key: number;
  /** The handoff the mounted composer was seeded from, so it is seeded only once. */
  seedHandoff?: string;
  /** The latest append stays recorded after acknowledgement to prevent route replays. */
  appendHandoff?: string;
  pendingAppend?: string;
  target: ChatTarget;
}>;

export function useChatComposerSession(
  target: ChatTarget,
  draftHandoff: AgentChatDraftHandoff | undefined,
) {
  const [sessionState, setSessionState] = useState<ChatComposerSessionState>(() => ({
    key: 0,
    ...(target.composerHandoff ? { seedHandoff: target.composerHandoff } : {}),
    target,
  }));
  const nextSessionState = resolveChatComposerSessionState(sessionState, target, draftHandoff);

  if (nextSessionState !== sessionState) {
    setSessionState(nextSessionState);
  }

  const completeAppend = useCallback((token: string) => {
    setSessionState((current) => {
      if (current.pendingAppend !== token) return current;
      const { pendingAppend: _pendingAppend, ...rest } = current;
      return rest;
    });
  }, []);

  return { composerSession: nextSessionState, completeAppend };
}

function resolveChatComposerSessionState(
  current: ChatComposerSessionState,
  target: ChatTarget,
  draftHandoff: AgentChatDraftHandoff | undefined,
): ChatComposerSessionState {
  const seedHandoff = target.composerHandoff;
  if (seedHandoff && seedHandoff !== current.seedHandoff && seedHandoff !== current.appendHandoff) {
    if (isSameChatTarget(current.target, target)) {
      return { ...current, appendHandoff: seedHandoff, pendingAppend: seedHandoff, target };
    }
    return { key: current.key + 1, seedHandoff, target };
  }

  if (isSameChatTarget(current.target, target)) {
    return current;
  }

  // Switching Agents inside a Draft keeps the composer: its text and attachments belong to the
  // user, not to the Agent they were written under.
  if (current.target.kind === 'draft' && target.kind === 'draft') {
    return { ...current, target };
  }

  const preservesDraftComposer =
    current.target.kind === 'draft' &&
    target.kind === 'session' &&
    draftHandoff?.agentId === current.target.agentId &&
    draftHandoff.sessionId === target.sessionId;

  return preservesDraftComposer
    ? { ...current, draftAgentId: current.target.agentId, target }
    : { key: current.key + 1, target };
}

function isSameChatTarget(left: ChatTarget, right: ChatTarget) {
  if (left.kind === 'draft') {
    return right.kind === 'draft' && left.agentId === right.agentId;
  }

  return right.kind === 'session' && left.sessionId === right.sessionId;
}
