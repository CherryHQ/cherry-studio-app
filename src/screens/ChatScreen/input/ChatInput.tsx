import { resolveIcon } from '@cherrystudio/ui/icons';
import { useCallback, useRef } from 'react';
import {
  getNextModelSelection,
  ModelPickerBottomSheet,
  type ModelPickerBottomSheetHandle,
  type ModelPickerModelItem,
  useModelSettingSelections,
  usePrefetchModelPickerData,
} from '@/components/modelPicker';
import { isUniqueModelId } from '@/data/types/model';
import { useModelById, useProviders, useTopic } from '@/hooks/chat';
import { useChatRuntimeTopic } from '../runtime';
import { ChatInputActionSheet } from './components/ChatInputActionSheet';
import { ChatInputReasoningSection } from './components/ChatInputReasoningSection';
import { type ChatInputSendPayload, ChatInputSurface } from './components/ChatInputSurface';
import { useChatInputReasoningEffortSync } from './hooks/useChatInputReasoningEffortSync';
import { useChatInputReasoningEfforts } from './hooks/useChatInputReasoningEfforts';
import { createChatInputMessageParts } from './utils/chatInputAttachments';

type ChatInputProps = {
  topicId?: string;
};

export function ChatInput({ topicId }: ChatInputProps) {
  const modelSettings = useModelSettingSelections();
  usePrefetchModelPickerData();
  const modelPickerRef = useRef<ModelPickerBottomSheetHandle>(null);
  const selectedModelId = isUniqueModelId(modelSettings.selections.default)
    ? modelSettings.selections.default
    : null;
  const chatRuntime = useChatRuntimeTopic(topicId);
  const topicQuery = useTopic(topicId);
  const selectedAssistantId = topicId ? (topicQuery.data?.assistantId ?? null) : null;
  const { model: selectedModel } = useModelById(selectedModelId);
  const selectedModelLabel = selectedModel?.name;
  const { providers } = useProviders();
  const selectedModelProvider = selectedModel
    ? providers.find((provider) => provider.id === selectedModel.providerId)
    : undefined;
  const selectedModelIcon = selectedModel
    ? resolveIcon(
        selectedModel.modelId,
        selectedModelProvider?.presetProviderId ?? selectedModel.providerId,
      )
    : undefined;
  const reasoningEfforts = useChatInputReasoningEfforts();
  useChatInputReasoningEffortSync(reasoningEfforts);

  const openModelPicker = useCallback(() => {
    modelPickerRef.current?.present();
  }, []);
  const handleModelSelect = useCallback(
    (item: ModelPickerModelItem) => {
      const nextModelId = getNextModelSelection(selectedModelId, item.modelId);

      modelSettings.onSelectionChange('default', nextModelId);
    },
    [modelSettings, selectedModelId],
  );
  const handleSendPress = useCallback(
    (payload: ChatInputSendPayload) => {
      const parts = createChatInputMessageParts(payload.text, payload.attachments);

      return chatRuntime.sendText({
        assistantId: selectedAssistantId,
        parts,
        selectedModelId,
        text: payload.text,
      });
    },
    [chatRuntime, selectedAssistantId, selectedModelId],
  );

  return (
    <>
      <ChatInputSurface
        isSendEnabled
        isStreaming={chatRuntime.isBusy}
        modelIcon={selectedModelIcon}
        modelLabel={selectedModelLabel}
        onModelPickerPress={openModelPicker}
        onSendPress={handleSendPress}
        onStopPress={chatRuntime.abort}
        reasoningEfforts={reasoningEfforts}
      />
      <ChatInputActionSheet />
      <ModelPickerBottomSheet
        footer={reasoningEfforts.length > 0 ? <ChatInputReasoningSection /> : undefined}
        onSelect={handleModelSelect}
        ref={modelPickerRef}
        selectedModelId={selectedModelId}
      />
    </>
  );
}
