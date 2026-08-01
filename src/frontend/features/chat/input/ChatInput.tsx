import { resolveIcon } from '@cherrystudio/ui/icons';
import { useCallback, useEffect, useState } from 'react';
import {
  getNextModelSelection,
  ModelPickerBottomSheet,
  type ModelPickerModelItem,
  useModelSettingSelections,
  usePrefetchModelPickerData,
} from '@/frontend/components/modelPicker';
import { useModelById, useProviders, useTopic } from '@/frontend/hooks/chat';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { isUniqueModelId } from '@/shared/data/types/model';
import { useChatSessionTopic } from '../session';
import { ChatInputActionSheet } from './components/ChatInputActionSheet';
import { ChatInputReasoningSection } from './components/ChatInputReasoningSection';
import { type ChatInputSendPayload, ChatInputSurface } from './components/ChatInputSurface';
import { useChatInputActions, useChatInputState } from './context/ChatInputProvider';
import { useChatInputReasoningEffortSync } from './hooks/useChatInputReasoningEffortSync';
import { useChatInputReasoningEfforts } from './hooks/useChatInputReasoningEfforts';
import { createChatInputMessageParts } from './utils/chatInputAttachments';

type ChatInputProps = {
  /**
   * Assistant to bind a newly created topic to, from the "start chat" entry on
   * the assistant detail screen. Once `topicId` exists the topic record owns
   * the binding and this is ignored.
   */
  assistantId?: string;
  topicId?: string;
};

// 诊断埋点：量化输入框「真实 model 名」解析耗时（pref 段 + model DB 段）。`[PERF]` 前缀。
const perfLog = loggerService.withContext('ChatPerf');

export function ChatInput({ assistantId, topicId }: ChatInputProps) {
  const modelSettings = useModelSettingSelections();
  usePrefetchModelPickerData();
  const rawDefaultModel = modelSettings.selections.default;
  const selectedModelId = isUniqueModelId(rawDefaultModel) ? rawDefaultModel : null;
  const chatSession = useChatSessionTopic(topicId);
  const topicQuery = useTopic(topicId);
  const selectedAssistantId = topicId
    ? (topicQuery.data?.assistantId ?? null)
    : (assistantId ?? null);
  const { model: selectedModel } = useModelById(selectedModelId);
  const selectedModelLabel = selectedModel?.name;

  // model 名两段异步：pref 读出 default id（rawDefaultModel）→ DB 读出 model.name。
  // 记录每段解析时刻，与 [PERF] tap->push / ChatScreen state 对齐，定位「等很久才显示真实 model」。
  useEffect(() => {
    perfLog.debug('[PERF] ChatInput model', {
      rawDefaultModel: rawDefaultModel ?? null,
      selectedModelId,
      label: selectedModelLabel ?? null,
      t: Date.now(),
    });
  }, [rawDefaultModel, selectedModelId, selectedModelLabel]);
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
  const { isActionSheetOpen, reasoningEffort } = useChatInputState();
  const { selectReasoningEffort } = useChatInputActions();
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

      return chatSession.sendText({
        assistantId: selectedAssistantId,
        parts,
        reasoningEffort,
        selectedModelId,
        text: payload.text,
      });
    },
    [chatSession, reasoningEffort, selectedAssistantId, selectedModelId],
  );

  return (
    <>
      <ChatInputSurface
        isSendEnabled
        isStreaming={chatSession.isBusy}
        modelIcon={selectedModelIcon}
        modelLabel={selectedModelLabel}
        onModelPickerPress={openModelPicker}
        onSendPress={handleSendPress}
        onStopPress={chatSession.abort}
        reasoningEfforts={reasoningEfforts}
      />
      {isActionSheetOpen ? <ChatInputActionSheet /> : null}
      {isModelPickerOpen ? (
        <ModelPickerBottomSheet
          footer={
            reasoningEfforts.length > 0 ? (
              <ChatInputReasoningSection
                reasoningEffort={reasoningEffort}
                onSelectReasoningEffort={selectReasoningEffort}
              />
            ) : undefined
          }
          isOpen
          onClose={closeModelPicker}
          onSelect={handleModelSelect}
          selectedModelId={selectedModelId}
        />
      ) : null}
    </>
  );
}
