import { type Ref, useCallback, useMemo, useRef } from 'react';
import {
  getNextModelSelection,
  ModelPickerBottomSheet,
  type ModelPickerBottomSheetHandle,
  type ModelPickerModelItem,
  type ModelPickerReasoningConfig,
  useModelSettingSelections,
  usePrefetchModelPickerData,
} from '@/components/modelPicker';
import { isUniqueModelId } from '@/data/types/model';
import { useModelById, useTopic } from '@/hooks/chat';
import { ChatInputActionSheet } from '@/screens/ChatScreen/input/components/ChatInputActionSheet';
import {
  type ChatInputSendPayload,
  ChatInputSurface,
} from '@/screens/ChatScreen/input/components/ChatInputSurface';
import {
  ChatInputProvider,
  useChatInputActions,
  useChatInputState,
} from '@/screens/ChatScreen/input/context/ChatInputProvider';
import { createChatInputMessageParts } from '@/screens/ChatScreen/input/utils/chatInputAttachments';
import {
  type ChatInputReasoningEffort,
  chatInputReasoningEffortOptions,
} from '@/screens/ChatScreen/input/utils/chatInputReasoning';
import { useChatRuntimeTopic } from '@/screens/ChatScreen/runtime';

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
    <ChatInputProvider>
      <ChatInputSurface
        isSendEnabled
        isStreaming={chatRuntime.isBusy}
        modelLabel={selectedModelLabel}
        onModelPickerPress={openModelPicker}
        onSendPress={handleSendPress}
        onStopPress={chatRuntime.abort}
      />
      <ChatInputActionSheet />
      <ChatInputModelPicker
        onSelect={handleModelSelect}
        pickerRef={modelPickerRef}
        selectedModelId={selectedModelId}
      />
    </ChatInputProvider>
  );
}

// Bridges the chat-input reasoning state (only available inside ChatInputProvider)
// into the otherwise-generic model picker as injected props.
function ChatInputModelPicker({
  onSelect,
  pickerRef,
  selectedModelId,
}: {
  onSelect: (item: ModelPickerModelItem) => void;
  pickerRef: Ref<ModelPickerBottomSheetHandle>;
  selectedModelId: string | null;
}) {
  const { reasoningEffort } = useChatInputState();
  const { selectReasoningEffort } = useChatInputActions();
  const reasoning = useMemo<ModelPickerReasoningConfig>(
    () => ({
      onChange: (value) => selectReasoningEffort(value as ChatInputReasoningEffort),
      options: chatInputReasoningEffortOptions,
      value: reasoningEffort,
    }),
    [reasoningEffort, selectReasoningEffort],
  );

  return (
    <ModelPickerBottomSheet
      onSelect={onSelect}
      reasoning={reasoning}
      ref={pickerRef}
      selectedModelId={selectedModelId}
    />
  );
}
