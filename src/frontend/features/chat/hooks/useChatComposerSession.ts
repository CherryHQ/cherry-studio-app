import { useState } from 'react';

import type { ChatTarget } from '@/frontend/appShell/navigation/chat';

import type { AgentChatDraftHandoff } from '../runtime/agentChatDraftHandoff';

export type ChatComposerSessionState = Readonly<{
  draftAgentId?: string;
  key: number;
  /** The handoff the mounted composer was seeded from, so it is seeded only once. */
  seedHandoff?: string;
  target: ChatTarget;
}>;

export function useChatComposerSession(
  target: ChatTarget,
  draftHandoff: AgentChatDraftHandoff | undefined,
) {
  const [sessionState, setSessionState] = useState<ChatComposerSessionState>(() => ({
    key: 0,
    ...(target.kind === 'draft' && target.composerHandoff
      ? { seedHandoff: target.composerHandoff }
      : {}),
    target,
  }));
  const nextSessionState = resolveChatComposerSessionState(sessionState, target, draftHandoff);

  if (nextSessionState !== sessionState) {
    setSessionState(nextSessionState);
  }

  return nextSessionState;
}

function resolveChatComposerSessionState(
  current: ChatComposerSessionState,
  target: ChatTarget,
  draftHandoff: AgentChatDraftHandoff | undefined,
): ChatComposerSessionState {
  const seedHandoff = target.kind === 'draft' ? target.composerHandoff : undefined;
  // An arriving handoff always opens a fresh composer, replacing whatever draft was there.
  if (seedHandoff && seedHandoff !== current.seedHandoff) {
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

  return {
    ...(preservesDraftComposer
      ? { draftAgentId: current.target.agentId, seedHandoff: current.seedHandoff }
      : {}),
    key: preservesDraftComposer ? current.key : current.key + 1,
    target,
  };
}

function isSameChatTarget(left: ChatTarget, right: ChatTarget) {
  if (left.kind === 'draft') {
    return right.kind === 'draft' && left.agentId === right.agentId;
  }

  return right.kind === 'session' && left.sessionId === right.sessionId;
}
