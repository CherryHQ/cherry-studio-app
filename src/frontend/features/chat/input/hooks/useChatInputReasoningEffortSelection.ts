import type { ReasoningEffortOption } from '@cherrystudio/universal/types/aiSdk';
import { useCallback, useState } from 'react';

import {
  CHAT_INPUT_DEFAULT_REASONING_EFFORT,
  type ChatInputReasoningEffort,
  resolveAvailableChatInputReasoningEffort,
} from '../utils/chatInputReasoning';

type ReasoningEffortOverride = {
  /** The assistant the pick was made on; a different one starts over. */
  assistantId: string | null;
  reasoningEffort: ChatInputReasoningEffort;
};

/**
 * The reasoning effort behind the model pill: the value to show and to send,
 * and whether the user picked it themselves rather than inheriting it from the
 * assistant. It is chat's own state, not the composer's — painting has no such
 * concept — so it lives here and reaches the composer as a badge.
 *
 * Only the user's pick is state. Everything else is derived on read, which is
 * what keeps the pill and the next message from ever disagreeing: the model's
 * stops change asynchronously, and a value mirrored into state through an
 * effect would be stale for exactly as long as it takes React to catch up.
 */
export function useChatInputReasoningEffortSelection(
  reasoningEfforts: readonly ChatInputReasoningEffort[],
  assistantReasoningEffort: ReasoningEffortOption = CHAT_INPUT_DEFAULT_REASONING_EFFORT,
  assistantId?: string | null,
) {
  const [override, setOverride] = useState<ReasoningEffortOverride | null>(null);

  // Retire the override during render, not from an effect: a model with no
  // reasoning stops has nothing to override, and a pick made on one assistant
  // must not follow the user to the next one.
  let activeOverride = override;
  if (
    activeOverride &&
    (activeOverride.assistantId !== (assistantId ?? null) || reasoningEfforts.length === 0)
  ) {
    activeOverride = null;
    setOverride(null);
  }

  const selectReasoningEffort = useCallback(
    (nextReasoningEffort: ChatInputReasoningEffort) => {
      setOverride({ assistantId: assistantId ?? null, reasoningEffort: nextReasoningEffort });
    },
    [assistantId],
  );

  return {
    isReasoningEffortSelected: activeOverride !== null,
    // Snapped to what the model actually offers, whichever source it came from:
    // switching models can drop the stop that was picked.
    reasoningEffort: resolveAvailableChatInputReasoningEffort(
      activeOverride?.reasoningEffort ?? assistantReasoningEffort,
      reasoningEfforts,
    ),
    selectReasoningEffort,
  };
}
