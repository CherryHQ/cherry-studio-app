import { useCallback, useState } from 'react';

import {
  CHAT_INPUT_DEFAULT_REASONING_EFFORT,
  type ChatInputReasoningEffort,
  resolveAvailableChatInputReasoningEffort,
} from '../utils/chatInputReasoning';

type ReasoningEffortOverride = {
  agentId: string | null;
  reasoningEffort: ChatInputReasoningEffort;
};

/**
 * Owns the composer's per-turn reasoning selection. Without a local override,
 * the selected model's default reasoning mode is used.
 */
export function useChatInputReasoningEffortSelection(
  reasoningEfforts: readonly ChatInputReasoningEffort[],
  agentId?: string | null,
) {
  const [override, setOverride] = useState<ReasoningEffortOverride | null>(null);

  let activeOverride = override;
  if (
    activeOverride &&
    (activeOverride.agentId !== (agentId ?? null) || reasoningEfforts.length === 0)
  ) {
    activeOverride = null;
    setOverride(null);
  }

  const selectReasoningEffort = useCallback(
    (reasoningEffort: ChatInputReasoningEffort) => {
      setOverride({ agentId: agentId ?? null, reasoningEffort });
    },
    [agentId],
  );

  return {
    isReasoningEffortSelected: activeOverride !== null,
    reasoningEffort: resolveAvailableChatInputReasoningEffort(
      activeOverride?.reasoningEffort ?? CHAT_INPUT_DEFAULT_REASONING_EFFORT,
      reasoningEfforts,
    ),
    selectReasoningEffort,
  };
}
