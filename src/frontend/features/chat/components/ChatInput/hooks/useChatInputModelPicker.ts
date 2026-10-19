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
 * The composer's model sheet. Choosing one model makes it the Agent's model.
 * The multi-select mode chooses several models that answer each send
 * without changing the Agent, and applies each change at once; leaving the mode returns to the
 * Agent's model.
 */
export function useChatInputModelPicker({
  agentId,
  replyModels,
  selectedModelId,
  selectModel,
  setReplyModels,
}: {
  agentId?: string;
  replyModels: readonly UniqueModelId[] | null;
  /** The Agent's model. */
  selectedModelId: UniqueModelId | null;
  selectModel: (modelId: UniqueModelId) => void;
  setReplyModels: (models: readonly UniqueModelId[] | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  // Non-null while the sheet is in multi-select mode, in pick order. Fewer than two
  // models ask the Agent's model, so the sheet keeps the partial choice itself.
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
      if (agentId && selectedModelId !== item.modelId) selectModel(item.modelId);
    },
    [agentId, pickerModels, selectModel, selectedModelId, setReplyModels],
  );
  const multiSelect = useMemo<ModelPickerMultiSelect>(
    () => ({
      enabled: pickerModels !== null,
      onEnabledChange: (enabled) => {
        setPickerModels(enabled ? (selectedModelId ? [selectedModelId] : []) : null);
        if (!enabled) setReplyModels(null);
      },
      selectedModelIds: pickerModels ?? [],
      maxCount: MAX_PARALLEL_ANSWERS,
    }),
    [pickerModels, selectedModelId, setReplyModels],
  );
  return { close, isOpen, multiSelect, open, select };
}
