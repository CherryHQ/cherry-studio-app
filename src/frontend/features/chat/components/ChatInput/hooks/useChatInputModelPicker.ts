import { useCallback, useMemo, useState } from 'react';

import type {
  ModelPickerModelItem,
  ModelPickerMultiSelect,
} from '@/frontend/components/ModelPicker';
import { MAX_PARALLEL_ANSWERS } from '@/shared/contracts/agent';
import type { UniqueModelId } from '@/shared/data/types/model';

/** Asking one model is the ordinary send; the multi-select mode exists to ask several. */
const MIN_PARALLEL_MODELS = 2;

/**
 * The composer's model sheet. Single selection sets the conversation's model.
 * Multi-select applies to sends from this composer until the user exits it.
 */
export function useChatInputModelPicker({
  agentId,
  agentModelAnswersInParallel,
  replyModels,
  selectedModelId,
  selectModel,
  setReplyModels,
}: {
  agentId?: string;
  /** Whether the conversation's single model can answer alongside others. */
  agentModelAnswersInParallel: boolean;
  replyModels: readonly UniqueModelId[] | null;
  /** The conversation's single model. */
  selectedModelId: UniqueModelId | null;
  selectModel: (modelId: UniqueModelId) => void;
  setReplyModels: (models: readonly UniqueModelId[] | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  // Non-null while the sheet is in multi-select mode, in pick order. Fewer than two
  // models use the single selection, so the sheet keeps the partial choice itself.
  const [pickerModels, setPickerModels] = useState<readonly UniqueModelId[] | null>(null);
  const open = useCallback(() => {
    setPickerModels(replyModels);
    setIsOpen(true);
  }, [replyModels]);
  const close = useCallback(() => setIsOpen(false), []);
  const select = useCallback(
    (item: ModelPickerModelItem) => {
      if (pickerModels) {
        const next = pickerModels.includes(item.modelId)
          ? pickerModels.filter((modelId) => modelId !== item.modelId)
          : pickerModels.length < MAX_PARALLEL_ANSWERS
            ? [...pickerModels, item.modelId]
            : pickerModels;
        setPickerModels(next);
        setReplyModels(next.length >= MIN_PARALLEL_MODELS ? next : null);
        return;
      }
      setIsOpen(false);
      setReplyModels(null);
      if (agentId) selectModel(item.modelId);
    },
    [agentId, pickerModels, selectModel, setReplyModels],
  );
  const multiSelect = useMemo<ModelPickerMultiSelect>(
    () => ({
      enabled: pickerModels !== null,
      onEnabledChange: (enabled) => {
        setPickerModels(
          enabled
            ? selectedModelId && agentModelAnswersInParallel
              ? [selectedModelId]
              : []
            : null,
        );
        if (!enabled) setReplyModels(null);
      },
      selectedModelIds: pickerModels ?? [],
      maxCount: MAX_PARALLEL_ANSWERS,
    }),
    [agentModelAnswersInParallel, pickerModels, selectedModelId, setReplyModels],
  );
  return { close, isOpen, multiSelect, open, select };
}
