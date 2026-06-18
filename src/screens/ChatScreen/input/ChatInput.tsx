import { useRouter } from 'expo-router';
import { useToast } from 'heroui-native/toast';
import { type Ref, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AssistantPickerBottomSheet } from '@/components/assistantPicker';
import {
  getNextModelSelection,
  ModelPickerBottomSheet,
  type ModelPickerBottomSheetHandle,
  type ModelPickerModelItem,
  type ModelPickerReasoningConfig,
  useModelSettingSelections,
  usePrefetchModelPickerData,
} from '@/components/modelPicker';
import type { Assistant } from '@/data/types/assistant';
import { isUniqueModelId } from '@/data/types/model';
import { useAssistantApiById, useModelById, useTopic, useTopicMutations } from '@/hooks/chat';
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
  onPendingAssistantChange?: (assistantId: string | null) => void;
  pendingAssistantId?: string | null;
  topicId?: string;
};

export function ChatInput({
  onPendingAssistantChange,
  pendingAssistantId: controlledPendingAssistantId,
  topicId,
}: ChatInputProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const modelSettings = useModelSettingSelections();
  usePrefetchModelPickerData();
  const modelPickerRef = useRef<ModelPickerBottomSheetHandle>(null);
  const [isAssistantPickerOpen, setIsAssistantPickerOpen] = useState(false);
  const [localPendingAssistantId, setLocalPendingAssistantId] = useState<string | null>(null);
  const [topicAssistantOverride, setTopicAssistantOverride] = useState<{
    assistantId: string | null;
    topicId: string;
  } | null>(null);
  const pendingAssistantId =
    onPendingAssistantChange !== undefined
      ? (controlledPendingAssistantId ?? null)
      : localPendingAssistantId;
  const setPendingAssistantId = onPendingAssistantChange ?? setLocalPendingAssistantId;
  const selectedModelId = isUniqueModelId(modelSettings.selections.default)
    ? modelSettings.selections.default
    : null;
  const chatRuntime = useChatRuntimeTopic(topicId);
  const topicQuery = useTopic(topicId);
  const { updateTopic } = useTopicMutations();
  const selectedAssistantId = topicId
    ? topicAssistantOverride?.topicId === topicId
      ? topicAssistantOverride.assistantId
      : (topicQuery.data?.assistantId ?? null)
    : pendingAssistantId;
  const { assistant: selectedAssistant } = useAssistantApiById(selectedAssistantId ?? undefined);
  const { model: selectedModel } = useModelById(selectedModelId);
  const selectedAssistantLabel = selectedAssistant
    ? `${selectedAssistant.emoji || '🌟'} ${selectedAssistant.name}`
    : undefined;
  const selectedModelLabel = selectedModel?.name;

  const openModelPicker = useCallback(() => {
    modelPickerRef.current?.present();
  }, []);
  const openAssistantPicker = useCallback(() => {
    setIsAssistantPickerOpen(true);
  }, []);
  const closeAssistantPicker = useCallback(() => {
    setIsAssistantPickerOpen(false);
  }, []);
  const openCreateAssistant = useCallback(() => {
    setIsAssistantPickerOpen(false);
    router.push('/assistants/edit');
  }, [router]);
  const handleAssistantSelect = useCallback(
    (assistant: Assistant | null) => {
      const nextAssistantId = assistant?.id ?? null;

      if (!topicId) {
        setPendingAssistantId(nextAssistantId);
        return;
      }

      setTopicAssistantOverride({ assistantId: nextAssistantId, topicId });
      void updateTopic(topicId, { assistantId: nextAssistantId }).catch(() => {
        setTopicAssistantOverride(null);
        toast.show({
          label: t('assistant.toast.assignFailed'),
          variant: 'danger',
        });
      });
    },
    [setPendingAssistantId, t, toast, topicId, updateTopic],
  );
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
        assistantLabel={selectedAssistantLabel}
        isSendEnabled
        isStreaming={chatRuntime.isBusy}
        modelLabel={selectedModelLabel}
        onAssistantPickerPress={openAssistantPicker}
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
      <AssistantPickerBottomSheet
        isOpen={isAssistantPickerOpen}
        selectedAssistantId={selectedAssistantId}
        onClose={closeAssistantPicker}
        onCreatePress={openCreateAssistant}
        onSelect={handleAssistantSelect}
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
