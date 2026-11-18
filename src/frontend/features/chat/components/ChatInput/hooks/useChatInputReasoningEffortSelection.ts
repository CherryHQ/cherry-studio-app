import { useCallback, useEffect } from 'react';

import { usePersistCache } from '@/frontend/data';

import {
  CHAT_INPUT_DEFAULT_REASONING_EFFORT,
  type ChatInputReasoningEffort,
  resolveAvailableChatInputReasoningEffort,
} from '../utils/chatInputReasoning';

const MAX_SESSION_EFFORT_ENTRIES = 200;
const SESSION_KEY_PREFIX = 'session:';

function setScopedEffort(
  current: Record<string, ChatInputReasoningEffort>,
  entries: Record<string, ChatInputReasoningEffort>,
): Record<string, ChatInputReasoningEffort> {
  const next = { ...current };
  for (const [key, value] of Object.entries(entries)) {
    delete next[key];
    next[key] = value;
  }
  const sessionKeys = Object.keys(next).filter((key) => key.startsWith(SESSION_KEY_PREFIX));
  if (sessionKeys.length <= MAX_SESSION_EFFORT_ENTRIES) return next;
  for (const key of sessionKeys.slice(0, sessionKeys.length - MAX_SESSION_EFFORT_ENTRIES)) {
    delete next[key];
  }
  return next;
}

/**
 * Remembers the last composer effort in the persistent UI cache, isolating per-Session
 * clamping so a non-reasoning conversation does not overwrite another Session on the same Agent.
 */
export function useChatInputReasoningEffortSelection(
  reasoningEfforts: readonly ChatInputReasoningEffort[] | undefined,
  agentId?: string | null,
  sessionId?: string | null,
) {
  const [effortsByScope, setEffortsByScope] = usePersistCache('chat.reasoning_efforts');
  const sessionKey = sessionId ? `${SESSION_KEY_PREFIX}${sessionId}` : undefined;
  const cachedEffort =
    (sessionKey ? effortsByScope[sessionKey] : undefined) ??
    (agentId ? effortsByScope[agentId] : undefined);
  const reasoningEffort = resolveAvailableChatInputReasoningEffort(
    cachedEffort ?? CHAT_INPUT_DEFAULT_REASONING_EFFORT,
    reasoningEfforts ?? [],
  );

  useEffect(() => {
    // An unsent draft adapts its display without rewriting the Agent's remembered choice.
    if (!sessionKey || reasoningEfforts === undefined) return;
    setEffortsByScope((current) => {
      const previous = current[sessionKey] ?? (agentId ? current[agentId] : undefined);
      if (previous === undefined) return current;
      const next = resolveAvailableChatInputReasoningEffort(previous, reasoningEfforts);
      if (next === previous) return current;
      return setScopedEffort(current, { [sessionKey]: next });
    });
  }, [agentId, reasoningEfforts, sessionKey, setEffortsByScope]);

  const selectReasoningEffort = useCallback(
    (reasoningEffort: ChatInputReasoningEffort) => {
      if (!sessionKey && !agentId) return;
      setEffortsByScope((current) =>
        setScopedEffort(current, {
          ...(agentId ? { [agentId]: reasoningEffort } : {}),
          ...(sessionKey ? { [sessionKey]: reasoningEffort } : {}),
        }),
      );
    },
    [agentId, sessionKey, setEffortsByScope],
  );

  return {
    isReasoningEffortSelected: cachedEffort !== undefined,
    reasoningEffort,
    selectReasoningEffort,
  };
}
