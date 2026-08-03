import type { ReasoningEffortOption } from '@cherrystudio/universal/types/aiSdk';
import { useEffect, useRef } from 'react';

import { useChatInputActions, useChatInputState } from '../context/ChatInputProvider';
import {
  CHAT_INPUT_DEFAULT_REASONING_EFFORT,
  type ChatInputReasoningEffort,
  isChatInputReasoningEffortAvailable,
  resolveAvailableChatInputReasoningEffort,
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
  assistantReasoningEffort: ReasoningEffortOption = CHAT_INPUT_DEFAULT_REASONING_EFFORT,
  assistantId?: string | null,
) {
  const { isReasoningEffortSelected, reasoningEffort } = useChatInputState();
  const { clearReasoningEffort, selectReasoningEffort, syncReasoningEffort } =
    useChatInputActions();
  const previousAssistantId = useRef(assistantId);

  useEffect(() => {
    if (previousAssistantId.current === assistantId) return;
    previousAssistantId.current = assistantId;
    clearReasoningEffort();
  }, [assistantId, clearReasoningEffort]);

  useEffect(() => {
    if (reasoningEfforts.length === 0) {
      if (isReasoningEffortSelected || reasoningEffort !== CHAT_INPUT_DEFAULT_REASONING_EFFORT) {
        clearReasoningEffort();
      }
      return;
    }

    if (!isReasoningEffortSelected) {
      const nextReasoningEffort = resolveAvailableChatInputReasoningEffort(
        assistantReasoningEffort,
        reasoningEfforts,
      );
      if (reasoningEffort !== nextReasoningEffort) {
        syncReasoningEffort(nextReasoningEffort);
      }
      return;
    }

    if (!isChatInputReasoningEffortAvailable(reasoningEffort, reasoningEfforts)) {
      selectReasoningEffort(
        resolveAvailableChatInputReasoningEffort(reasoningEffort, reasoningEfforts),
      );
    }
  }, [
    assistantReasoningEffort,
    clearReasoningEffort,
    isReasoningEffortSelected,
    reasoningEffort,
    reasoningEfforts,
    selectReasoningEffort,
    syncReasoningEffort,
  ]);
}
