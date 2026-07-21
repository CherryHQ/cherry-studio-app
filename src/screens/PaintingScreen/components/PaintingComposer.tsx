import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import { resolveIcon } from '@cherrystudio/ui/icons';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModelPickerBottomSheet, type ModelPickerModelItem } from '@/components/modelPicker';
import { isUniqueModelId, type UniqueModelId } from '@/data/types/model';
import type { Painting } from '@/data/types/painting';
import { useModelById, useModels, useProviders } from '@/hooks/chat';
import type { ResolvedPaintingFiles } from '@/hooks/paintings';
import { getChatInputKeyboardStickyOffset } from '@/screens/ChatScreen/input/chatInputLayout';
import { ChatInputActionSheet } from '@/screens/ChatScreen/input/components/ChatInputActionSheet';
import {
  type ChatInputSendPayload,
  ChatInputSurface,
} from '@/screens/ChatScreen/input/components/ChatInputSurface';
import { useChatInputState } from '@/screens/ChatScreen/input/context/ChatInputProvider';

import { usePaintingGeneration } from '../hooks/usePaintingGeneration';
import { PaintingCanvas } from './PaintingCanvas';

export function PaintingComposer({
  initialFiles,
  painting,
}: {
  initialFiles: ResolvedPaintingFiles;
  painting?: Painting;
}) {
  const { bottom } = useSafeAreaInsets();
  const keyboardInputOffset = getChatInputKeyboardStickyOffset(bottom);
  const initialModelId =
    painting?.modelId && isUniqueModelId(painting.modelId) ? painting.modelId : null;
  const [selectedModelId, setSelectedModelId] = useState<UniqueModelId | null>(initialModelId);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const { draft, isActionSheetOpen } = useChatInputState();
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
  const generation = usePaintingGeneration({
    initialOutputs: initialFiles.outputs,
  });

  const closeModelPicker = useCallback(() => setIsModelPickerOpen(false), []);
  const handleModelSelect = useCallback((item: ModelPickerModelItem) => {
    setSelectedModelId(item.modelId);
    setIsModelPickerOpen(false);
  }, []);
  const handleSend = useCallback(
    async ({ attachments: nextAttachments, text }: ChatInputSendPayload) => {
      if (!selectedModelId || !isSelectedModelAvailable) {
        throw new Error('Select an available image generation model');
      }
      await generation.generate({
        attachments: nextAttachments,
        modelId: selectedModelId,
        prompt: text,
      });
    },
    [generation, isSelectedModelAvailable, selectedModelId],
  );

  return (
    <View className="flex-1 bg-background">
      <PaintingCanvas
        error={generation.error}
        onRevealFinish={generation.finishReveal}
        outputs={generation.outputs}
        status={generation.status}
      />
      <KeyboardStickyView offset={{ opened: keyboardInputOffset }}>
        <View className="px-3 pb-2" testID="painting-composer">
          <ChatInputSurface
            isSendEnabled={
              Boolean(selectedModelId) &&
              isSelectedModelAvailable &&
              draft.trim().length > 0 &&
              generation.status === 'idle'
            }
            isStreaming={generation.status === 'generating'}
            modelIcon={selectedModelIcon}
            modelLabel={selectedModelLabel}
            onModelPickerPress={() => setIsModelPickerOpen(true)}
            onSendPress={handleSend}
            onStopPress={generation.cancel}
          />
        </View>
      </KeyboardStickyView>
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
    </View>
  );
}

function historicalModelLabel(painting: Painting | undefined): string | undefined {
  if (!painting?.modelId) {
    return undefined;
  }
  const separator = painting.modelId.indexOf('::');
  return separator >= 0 ? painting.modelId.slice(separator + 2) : painting.modelId;
}
