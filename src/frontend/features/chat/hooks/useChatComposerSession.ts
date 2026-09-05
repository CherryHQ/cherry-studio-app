import { useState } from 'react';

import type { ChatTarget } from '@/frontend/appShell/navigation/chat';

import type { AgentChatDraftHandoff } from '../runtime/agentChatDraftHandoff';

export type ChatComposerSessionState = Readonly<{
  draftAgentId?: string;
  key: number;
  target: ChatTarget;
}>;

export function useChatComposerSession(
  target: ChatTarget,
  draftHandoff: AgentChatDraftHandoff | undefined,
) {
  const [sessionState, setSessionState] = useState<ChatComposerSessionState>(() => ({
    key: 0,
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
  if (isSameChatTarget(current.target, target)) {
    return current;
  }

  const preservesDraftComposer =
    current.target.kind === 'draft' &&
    target.kind === 'session' &&
    draftHandoff?.agentId === current.target.agentId &&
    draftHandoff.sessionId === target.sessionId;

  return {
    ...(preservesDraftComposer ? { draftAgentId: current.target.agentId } : {}),
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
