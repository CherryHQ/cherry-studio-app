import type { ReasoningEffortOption } from '@cherrystudio/universal/types/aiSdk';
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
 * Owns the composer's per-turn reasoning selection. Agent configuration is an
 * inherited fallback only and is never mutated by this state.
 */
export function useChatInputReasoningEffortSelection(
  reasoningEfforts: readonly ChatInputReasoningEffort[],
  agentReasoningEffort: ReasoningEffortOption = CHAT_INPUT_DEFAULT_REASONING_EFFORT,
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
      activeOverride?.reasoningEffort ?? agentReasoningEffort,
      reasoningEfforts,
    ),
    selectReasoningEffort,
  };
}
