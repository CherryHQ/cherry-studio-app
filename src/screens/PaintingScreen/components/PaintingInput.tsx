import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import { resolveIcon } from '@cherrystudio/ui/icons';
import { useCallback, useState } from 'react';

import { ModelPickerBottomSheet, type ModelPickerModelItem } from '@/components/modelPicker';
import { isUniqueModelId, type UniqueModelId } from '@/data/types/model';
import type { Painting } from '@/data/types/painting';
import { useModelById, useModels, useProviders } from '@/hooks/chat';
import { ChatInputActionSheet } from '@/screens/ChatScreen/input/components/ChatInputActionSheet';
import {
  type ChatInputSendPayload,
  ChatInputSurface,
} from '@/screens/ChatScreen/input/components/ChatInputSurface';
import {
  useChatInputActions,
  useChatInputState,
} from '@/screens/ChatScreen/input/context/ChatInputProvider';

import type {
  PaintingGenerationInput,
  PaintingGenerationResult,
  PaintingGenerationStatus,
} from '../hooks/usePaintingGeneration';
import { createPaintingOutputAttachmentDraft } from '../utils/paintingOutputAttachment';

type PaintingInputProps = {
  onCancel: () => void;
  onGenerate: (input: PaintingGenerationInput) => Promise<PaintingGenerationResult>;
  onGenerated?: (result: PaintingGenerationResult) => void;
  painting?: Painting;
  status: PaintingGenerationStatus;
};

export function PaintingInput({
  onCancel,
  onGenerate,
  onGenerated,
  painting,
  status,
}: PaintingInputProps) {
  const initialModelId =
    painting?.modelId && isUniqueModelId(painting.modelId) ? painting.modelId : null;
  const [selectedModelId, setSelectedModelId] = useState<UniqueModelId | null>(initialModelId);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const { draft, isActionSheetOpen } = useChatInputState();
  const { setAttachments } = useChatInputActions();
  const { model: selectedModel } = useModelById(selectedModelId);
  const { models: enabledImageModels } = useModels({
    capability: MODEL_CAPABILITY.IMAGE_GENERATION,
    enabled: true,
  });
  const { providers: enabledProviders } = useProviders({ enabled: true });
  const enabledProviderIds = new Set(enabledProviders.map((provider) => provider.id));
  const isSelectedModelAvailable = enabledImageModels.some(
    (model) =>
      model.id === selectedModelId && !model.isHidden && enabledProviderIds.has(model.providerId),
  );
  const selectedProvider = selectedModel
    ? enabledProviders.find((provider) => provider.id === selectedModel.providerId)
    : undefined;
  const selectedModelIcon = selectedModel
    ? resolveIcon(
        selectedModel.modelId,
        selectedProvider?.presetProviderId ?? selectedModel.providerId,
      )
    : undefined;
  const selectedModelLabel = selectedModel?.name ?? historicalModelLabel(painting);

  const closeModelPicker = useCallback(() => setIsModelPickerOpen(false), []);
  const handleModelSelect = useCallback((item: ModelPickerModelItem) => {
    setSelectedModelId(item.modelId);
    setIsModelPickerOpen(false);
  }, []);
  const handleSend = useCallback(
    async ({ attachments, text }: ChatInputSendPayload) => {
      if (!selectedModelId || !isSelectedModelAvailable) {
        throw new Error('Select an available image generation model');
      }
      const result = await onGenerate({
        attachments,
        modelId: selectedModelId,
        prompt: text,
      });
      setAttachments([createPaintingOutputAttachmentDraft(result.output)]);
      onGenerated?.(result);
    },
    [isSelectedModelAvailable, onGenerate, onGenerated, selectedModelId, setAttachments],
  );

  return (
    <>
      <ChatInputSurface
        isSendEnabled={
          Boolean(selectedModelId) &&
          isSelectedModelAvailable &&
          draft.trim().length > 0 &&
          status === 'idle'
        }
        isStreaming={status === 'generating'}
        modelIcon={selectedModelIcon}
        modelLabel={selectedModelLabel}
        onModelPickerPress={() => setIsModelPickerOpen(true)}
        onSendPress={handleSend}
        onStopPress={onCancel}
      />
      {isActionSheetOpen ? <ChatInputActionSheet /> : null}
      {isModelPickerOpen ? (
        <ModelPickerBottomSheet
          isOpen
          onClose={closeModelPicker}
          onSelect={handleModelSelect}
          selectedModelId={selectedModelId}
          selectedTags={[MODEL_CAPABILITY.IMAGE_GENERATION]}
          showPinnedModels={false}
        />
      ) : null}
    </>
  );
}

function historicalModelLabel(painting: Painting | undefined): string | undefined {
  if (!painting?.modelId) {
    return undefined;
  }
  const separator = painting.modelId.indexOf('::');
  return separator >= 0 ? painting.modelId.slice(separator + 2) : painting.modelId;
}
