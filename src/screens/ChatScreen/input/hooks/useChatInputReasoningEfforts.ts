import { useMemo } from 'react';
import { useModelSettingSelections } from '@/components/modelPicker';
import { isUniqueModelId } from '@/data/types/model';
import { useModelById } from '@/hooks/chat';
import { getChatInputReasoningEffortsForModel } from '@/screens/ChatScreen/input/utils/chatInputReasoning';

/**
 * Reasoning effort levels supported by the currently selected default model,
 * normalized and ordered. Shared by the composer surface (pill) and the
 * reasoning panel so both always agree on the option subset.
 */
export function useChatInputReasoningEfforts() {
  const modelSettings = useModelSettingSelections();
  const selectedModelId = isUniqueModelId(modelSettings.selections.default)
    ? modelSettings.selections.default
    : null;
  const { model: selectedModel } = useModelById(selectedModelId);

  const reasoningEfforts = useMemo(
    () => (selectedModelId ? getChatInputReasoningEffortsForModel(selectedModel) : []),
    [selectedModel, selectedModelId],
  );

  return reasoningEfforts;
}
