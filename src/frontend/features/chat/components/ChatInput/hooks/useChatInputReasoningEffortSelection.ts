import { useCallback, useEffect } from 'react';

import { usePersistCache } from '@/frontend/data';

import {
  CHAT_INPUT_DEFAULT_REASONING_EFFORT,
  type ChatInputReasoningEffort,
  resolveAvailableChatInputReasoningEffort,
} from '../utils/chatInputReasoning';

/**
 * Remembers the last composer effort per Agent in the persistent UI cache.
 * Undefined options mean the model is still loading; an empty list resets to default.
 */
export function useChatInputReasoningEffortSelection(
  reasoningEfforts: readonly ChatInputReasoningEffort[] | undefined,
  agentId?: string | null,
) {
  const [effortsByAgent, setEffortsByAgent] = usePersistCache('chat.reasoning_efforts');
  const cachedEffort = agentId ? effortsByAgent[agentId] : undefined;
  const reasoningEffort = resolveAvailableChatInputReasoningEffort(
    cachedEffort ?? CHAT_INPUT_DEFAULT_REASONING_EFFORT,
    reasoningEfforts ?? [],
  );

  useEffect(() => {
    if (!agentId || reasoningEfforts === undefined) return;
    setEffortsByAgent((current) => {
      const previous = current[agentId];
      if (previous === undefined) return current;
      const next = resolveAvailableChatInputReasoningEffort(previous, reasoningEfforts);
      return next === previous ? current : { ...current, [agentId]: next };
    });
  }, [agentId, reasoningEfforts, setEffortsByAgent]);

  const selectReasoningEffort = useCallback(
    (reasoningEffort: ChatInputReasoningEffort) => {
      if (agentId) {
        setEffortsByAgent((current) => ({ ...current, [agentId]: reasoningEffort }));
      }
    },
    [agentId, setEffortsByAgent],
  );

  return {
    isReasoningEffortSelected: cachedEffort !== undefined,
    reasoningEffort,
    selectReasoningEffort,
  };
}
