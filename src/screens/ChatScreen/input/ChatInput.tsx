import { resolveIcon } from '@cherrystudio/ui/icons';
import { useCallback, useState } from 'react';
import {
  getNextModelSelection,
  ModelPickerBottomSheet,
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

import { useChatInputState } from './context/ChatInputProvider';
type ChatInputProps = {
  topicId?: string;
};

export function ChatInput({ topicId }: ChatInputProps) {
  const modelSettings = useModelSettingSelections();
  usePrefetchModelPickerData();
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

  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const closeModelPicker = useCallback(() => setIsModelPickerOpen(false), []);
  const openModelPicker = useCallback(() => setIsModelPickerOpen(true), []);
  const { isActionSheetOpen } = useChatInputState();
  const handleModelSelect = useCallback(
    (item: ModelPickerModelItem) => {
      const nextModelId = getNextModelSelection(selectedModelId, item.modelId);

      modelSettings.onSelectionChange('default', nextModelId);
      setIsModelPickerOpen(false);
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
      {isActionSheetOpen ? <ChatInputActionSheet /> : null}
      {isModelPickerOpen ? (
        <ModelPickerBottomSheet
          footer={reasoningEfforts.length > 0 ? <ChatInputReasoningSection /> : undefined}
          isOpen
          onClose={closeModelPicker}
          onSelect={handleModelSelect}
          selectedModelId={selectedModelId}
        />
      ) : null}
    </>
  );
}
