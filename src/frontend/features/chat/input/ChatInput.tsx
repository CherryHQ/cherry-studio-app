import { Composer } from '@cherrystudio/ui/components';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import {
  ComposerAttachments,
  ComposerField,
  ComposerMenu,
  ComposerModelPill,
  type ComposerSendPayload,
  ComposerSurface,
  useComposerMeta,
} from '@/frontend/components/composer';
import {
  createComposerMessageParts,
  isComposerAttachmentReady,
} from '@/frontend/components/composer/utils/composerAttachments';
import {
  getNextModelSelection,
  ModelPickerIcon,
  ModelPickerBottomSheet,
  type ModelPickerModelItem,
  useModelSettingSelections,
} from '@/frontend/components/modelPicker';
import {
  useAssistantApiById,
  useAssistantMutations,
  useModelById,
  useProviders,
  useTopic,
} from '@/frontend/hooks/chat';
import {
  reconcileReasoningEffortForModel,
  reconcileWebSearchForModel,
} from '@/frontend/hooks/chat/utils/modelReconcile';
import { type ToolMentionId, toolMentions, toolMentionUrl } from '@/frontend/utils/toolMentions';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { isUniqueModelId } from '@/shared/data/types/model';

import { useChatTopic } from '../runtime';
import { ChatInputEffortOverlay } from './components/ChatInputEffortOverlay';
import { ChatInputMenuItems } from './components/ChatInputMenuItems';
import { useChatInputReasoningEfforts } from './hooks/useChatInputReasoningEfforts';
import { useChatInputReasoningEffortSelection } from './hooks/useChatInputReasoningEffortSelection';
import { useChatInputWebSearchToggle } from './hooks/useChatInputWebSearchToggle';
import { getChatInputReasoningEffortSnapshot } from './utils/chatInputReasoning';

type ChatInputProps = {
  /**
   * Assistant to bind a newly created topic to, from the "start chat" entry on
   * the assistant detail screen. Once `topicId` exists the topic record owns
   * the binding and this is ignored.
   */
  assistantId?: string;
  dismissKeyboardOnSend?: boolean;
  topicId?: string;
};

// 诊断埋点：量化输入框「真实 model 名」解析耗时（pref 段 + model DB 段）。`[PERF]` 前缀。
const perfLog = loggerService.withContext('ChatPerf');

export function ChatInput({ assistantId, dismissKeyboardOnSend, topicId }: ChatInputProps) {
  const { t } = useTranslation();
  const modelSettings = useModelSettingSelections();
  const rawDefaultModel = modelSettings.selections.default;
  const defaultModelId = isUniqueModelId(rawDefaultModel) ? rawDefaultModel : null;
  const chatTopic = useChatTopic(topicId);
  const topicQuery = useTopic(topicId);
  const selectedAssistantId = topicId
    ? (topicQuery.data?.assistantId ?? null)
    : (assistantId ?? null);
  const { assistant: selectedAssistant } = useAssistantApiById(selectedAssistantId ?? undefined);
  const selectedModelId = selectedAssistantId
    ? (selectedAssistant?.modelId ?? null)
    : defaultModelId;
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
  const reasoningEfforts = useChatInputReasoningEfforts(selectedModel);
  const { isReasoningEffortSelected, reasoningEffort, selectReasoningEffort } =
    useChatInputReasoningEffortSelection(
      reasoningEfforts,
      selectedAssistant?.settings.reasoning_effort,
      selectedAssistantId,
    );

  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const closeModelPicker = useCallback(() => setIsModelPickerOpen(false), []);
  const openModelPicker = useCallback(() => setIsModelPickerOpen(true), []);
  const { updateAssistant } = useAssistantMutations();
  const { inputRef } = useComposerMeta();

  const persistWebSearch = useCallback(
    (targetAssistantId: string, enabled: boolean) =>
      updateAssistant(targetAssistantId, { settings: { enableWebSearch: enabled } }),
    [updateAssistant],
  );
  const logWebSearchFailure = useCallback((error: unknown) => {
    perfLog.warn('Failed to persist web search state', { error });
  }, []);
  const { enabled: isWebSearchEnabled, setEnabled: setWebSearchEnabled } =
    useChatInputWebSearchToggle(
      selectedAssistantId,
      selectedAssistant?.settings.enableWebSearch ?? false,
      persistWebSearch,
      logWebSearchFailure,
    );

  // The menu only writes the mention into the field; the text is what carries
  // it from here, through the sent message, into the conversation.
  //
  // Inserted at the caret rather than appended, and through the field rather
  // than through the draft, because a mention is a link: the URL is what names
  // the tool, and a string handed to `setDraft` has nowhere to put it.
  const handleMentionPress = useCallback(
    (mentionId: ToolMentionId) => {
      const mention = toolMentions.find((candidate) => candidate.id === mentionId);

      if (!mention) {
        return;
      }

      inputRef.current?.insertLink(t(mention.titleKey), toolMentionUrl(mention.id));
      // Typed text never joins a link, so this is spacing and nothing more —
      // without it whatever the user writes next abuts the mention.
      inputRef.current?.insertText(' ');
    },
    [inputRef, t],
  );
  const handleReasoningEffortSelect = useCallback(
    (nextReasoningEffort: Parameters<typeof selectReasoningEffort>[0]) => {
      selectReasoningEffort(nextReasoningEffort);
      if (!selectedAssistantId || !selectedAssistant) return;

      void updateAssistant(selectedAssistantId, {
        settings: { reasoning_effort: nextReasoningEffort },
      }).catch((error) => {
        perfLog.warn('Failed to persist reasoning effort', { error });
      });
    },
    [selectReasoningEffort, selectedAssistant, selectedAssistantId, updateAssistant],
  );
  const handleModelSelect = useCallback(
    (item: ModelPickerModelItem) => {
      if (selectedAssistantId && selectedAssistant) {
        if (selectedModelId !== item.modelId) {
          const reasoningPatch = reconcileReasoningEffortForModel(
            item.model,
            selectedAssistant.settings.reasoning_effort,
          );
          const webSearchPatch = reconcileWebSearchForModel(item.model, selectedAssistant.settings);
          const settingsPatch =
            reasoningPatch || webSearchPatch ? { ...reasoningPatch, ...webSearchPatch } : undefined;
          void updateAssistant(selectedAssistantId, {
            modelId: item.modelId,
            ...(settingsPatch ? { settings: settingsPatch } : {}),
          }).catch((error) => {
            perfLog.warn('Failed to persist assistant model', { error });
          });
        }
      } else {
        const nextModelId = getNextModelSelection(selectedModelId, item.modelId);
        modelSettings.onSelectionChange('default', nextModelId);
      }
      setIsModelPickerOpen(false);
    },
    [modelSettings, selectedAssistant, selectedAssistantId, selectedModelId, updateAssistant],
  );
  const handleSendPress = useCallback(
    (payload: ComposerSendPayload) => {
      const readyAttachments = payload.attachments.filter(isComposerAttachmentReady);
      if (readyAttachments.length !== payload.attachments.length) {
        throw new Error('Cannot send while attachments are importing');
      }
      const parts = createComposerMessageParts(payload.text, readyAttachments);

      return chatTopic.sendText({
        assistantId: selectedAssistantId,
        parts,
        reasoningEffort: getChatInputReasoningEffortSnapshot(
          reasoningEffort,
          isReasoningEffortSelected,
          selectedAssistant?.settings.reasoning_effort,
          reasoningEfforts,
        ),
        selectedModelId,
        text: payload.text,
      });
    },
    [
      chatTopic,
      isReasoningEffortSelected,
      reasoningEffort,
      reasoningEfforts,
      selectedAssistant?.settings.reasoning_effort,
      selectedAssistantId,
      selectedModelId,
    ],
  );

  return (
    <>
      <ChatInputEffortOverlay
        key={`${selectedModelId ?? 'no-model'}:${reasoningEfforts.join(',')}`}
        modelLabel={selectedModelLabel}
        onChange={handleReasoningEffortSelect}
        reasoningEffort={reasoningEffort}
        reasoningEfforts={reasoningEfforts}
      >
        {(effortGauge) => (
          <ComposerSurface
            dismissKeyboardOnSend={dismissKeyboardOnSend}
            onSend={handleSendPress}
            onStop={chatTopic.abort}
            streaming={chatTopic.isBusy}
          >
            <ComposerAttachments />
            <ComposerField />
            <Composer.Toolbar>
              <ComposerMenu>
                <ChatInputMenuItems
                  isWebSearchEnabled={isWebSearchEnabled}
                  onMentionPress={handleMentionPress}
                  onWebSearchChange={setWebSearchEnabled}
                />
              </ComposerMenu>
              <ComposerModelPill
                icon={
                  selectedModel ? (
                    <ModelPickerIcon
                      model={selectedModel}
                      provider={selectedModelProvider}
                      providerIconSize={18}
                      size={20}
                    />
                  ) : undefined
                }
                label={selectedModelLabel}
                onPress={openModelPicker}
              />
              <View className="ml-auto flex-row items-center gap-2">
                {effortGauge}
                <Composer.Send />
              </View>
            </Composer.Toolbar>
          </ComposerSurface>
        )}
      </ChatInputEffortOverlay>
      {isModelPickerOpen ? (
        <ModelPickerBottomSheet
          isOpen
          onClose={closeModelPicker}
          onSelect={handleModelSelect}
          selectedModelId={selectedModelId}
        />
      ) : null}
    </>
  );
}
