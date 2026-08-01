import { useEffect } from 'react';

import { useChatInputActions, useChatInputState } from '../context/ChatInputProvider';
import {
  CHAT_INPUT_DEFAULT_REASONING_EFFORT,
  type ChatInputReasoningEffort,
  getFallbackChatInputReasoningEffort,
  isChatInputReasoningEffortAvailable,
} from '../utils/chatInputReasoning';

/**
 * Keeps the selected reasoning effort valid for the current model: clears it
 * when the model exposes no reasoning stops, falls back to the nearest
 * available stop when the model's subset changes. Must run while the composer
 * is mounted (not only while the model picker sheet is open), so it lives
 * here instead of inside the sheet's reasoning section.
 */
export function useChatInputReasoningEffortSync(
  reasoningEfforts: readonly ChatInputReasoningEffort[],
) {
  const { isReasoningEffortSelected, reasoningEffort } = useChatInputState();
  const { clearReasoningEffort, selectReasoningEffort } = useChatInputActions();

  useEffect(() => {
    if (reasoningEfforts.length === 0) {
      if (isReasoningEffortSelected || reasoningEffort !== CHAT_INPUT_DEFAULT_REASONING_EFFORT) {
        clearReasoningEffort();
      }
      return;
    }

    if (!isChatInputReasoningEffortAvailable(reasoningEffort, reasoningEfforts)) {
      selectReasoningEffort(getFallbackChatInputReasoningEffort(reasoningEfforts));
    }
  }, [
    clearReasoningEffort,
    isReasoningEffortSelected,
    reasoningEffort,
    reasoningEfforts,
    selectReasoningEffort,
  ]);
}
