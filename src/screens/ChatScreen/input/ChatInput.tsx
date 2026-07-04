import { useCallback, useRef, useState } from 'react';
import {
  getNextModelSelection,
  ModelPickerBottomSheet,
  type ModelPickerBottomSheetHandle,
  type ModelPickerModelItem,
  useModelSettingSelections,
  usePrefetchModelPickerData,
} from '@/components/modelPicker';
import { isUniqueModelId } from '@/data/types/model';
import { useModelById, useTopic } from '@/hooks/chat';
import { ChatInputActionSheet } from '@/screens/ChatScreen/input/components/ChatInputActionSheet';
import { ChatInputReasoningSheet } from '@/screens/ChatScreen/input/components/ChatInputReasoningSheet';
import {
  type ChatInputSendPayload,
  ChatInputSurface,
} from '@/screens/ChatScreen/input/components/ChatInputSurface';
import { ChatInputProvider } from '@/screens/ChatScreen/input/context/ChatInputProvider';
import { createChatInputMessageParts } from '@/screens/ChatScreen/input/utils/chatInputAttachments';
import { useChatRuntimeTopic } from '@/screens/ChatScreen/runtime';

type ChatInputProps = {
  topicId?: string;
};

export function ChatInput({ topicId }: ChatInputProps) {
  const modelSettings = useModelSettingSelections();
  usePrefetchModelPickerData();
  const modelPickerRef = useRef<ModelPickerBottomSheetHandle>(null);
  const [isReasoningSheetOpen, setIsReasoningSheetOpen] = useState(false);
  const selectedModelId = isUniqueModelId(modelSettings.selections.default)
    ? modelSettings.selections.default
    : null;
  const chatRuntime = useChatRuntimeTopic(topicId);
  const topicQuery = useTopic(topicId);
  const selectedAssistantId = topicId ? (topicQuery.data?.assistantId ?? null) : null;
  const { model: selectedModel } = useModelById(selectedModelId);
  const selectedModelLabel = selectedModel?.name;

  const openModelPicker = useCallback(() => {
    modelPickerRef.current?.present();
  }, []);
  const openReasoningSheet = useCallback(() => {
    setIsReasoningSheetOpen(true);
  }, []);
  const closeReasoningSheet = useCallback(() => {
    setIsReasoningSheetOpen(false);
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
    <ChatInputProvider>
      <ChatInputSurface
        isSendEnabled
        isStreaming={chatRuntime.isBusy}
        modelLabel={selectedModelLabel}
        onModelPickerPress={openModelPicker}
        onReasoningPress={openReasoningSheet}
        onSendPress={handleSendPress}
        onStopPress={chatRuntime.abort}
      />
      <ChatInputActionSheet />
      <ChatInputReasoningSheet isOpen={isReasoningSheetOpen} onClose={closeReasoningSheet} />
      <ModelPickerBottomSheet
        onSelect={handleModelSelect}
        ref={modelPickerRef}
        selectedModelId={selectedModelId}
      />
    </ChatInputProvider>
  );
}
