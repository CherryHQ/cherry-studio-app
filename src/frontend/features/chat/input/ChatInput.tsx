import { Composer } from '@cherrystudio/ui/components';
import { resolveIcon } from '@cherrystudio/ui/icons';
import { isUniqueModelId } from '@cherrystudio/universal/data/types/model';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ComposerAttachments,
  ComposerField,
  ComposerMenu,
  ComposerModelPill,
  type ComposerSendPayload,
  ComposerSurface,
  useComposerState,
} from '@/frontend/components/composer';
import {
  createComposerMessageParts,
  hasComposerSendableContent,
  hasImportingComposerAttachments,
  isComposerAttachmentReady,
} from '@/frontend/components/composer/utils/composerAttachments';
import {
  getNextModelSelection,
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
import { loggerService } from '@/shared/core/logger/LoggerService';

import { useChatTopic } from '../runtime';
import { ChatInputEffortBadge } from './components/ChatInputEffortBadge';
import { ChatInputMenuItems } from './components/ChatInputMenuItems';
import { ChatInputReasoningSection } from './components/ChatInputReasoningSection';
import { ChatInputToolTag } from './components/ChatInputToolTag';
import { useChatInputReasoningEfforts } from './hooks/useChatInputReasoningEfforts';
import { useChatInputReasoningEffortSelection } from './hooks/useChatInputReasoningEffortSelection';
import {
  type ChatInputActionId,
  getChatInputAction,
  toggleChatInputAction,
} from './utils/chatInputActions';
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

type PendingWebSearchState = {
  assistantId: string;
  enabled: boolean;
  isUpdating: boolean;
};

// 诊断埋点：量化输入框「真实 model 名」解析耗时（pref 段 + model DB 段）。`[PERF]` 前缀。
const perfLog = loggerService.withContext('ChatPerf');

export function ChatInput({ assistantId, dismissKeyboardOnSend, topicId }: ChatInputProps) {
  const { attachments, draft } = useComposerState();
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
  const selectedModelIcon = selectedModel
    ? resolveIcon(
        selectedModel.modelId,
        selectedModelProvider?.presetProviderId ?? selectedModel.providerId,
      )
    : undefined;
  const reasoningEfforts = useChatInputReasoningEfforts();
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
  // The selected tool mirrors the assistant's `enableWebSearch`, so it is chat's
  // own state rather than the composer's — the tag and the menu rows below are
  // nodes this screen assembles, not something the composer models.
  const [selectedToolId, setSelectedTool] = useState<ChatInputActionId | null>(null);
  const selectedTool = getChatInputAction(selectedToolId);
  const pendingWebSearch = useRef<PendingWebSearchState | undefined>(undefined);
  const syncedAssistantId = useRef<string | null>(null);

  // The one effect the reasoning effort's derive-on-read treatment does not fit:
  // `enableWebSearch` is written back to the assistant, so this is not deriving
  // a value but subscribing to an external store that the user's own optimistic
  // write is racing. `pendingWebSearch` is what holds the optimistic value until
  // the query reflects it, and it can only be checked once the query has moved.
  /* eslint-disable react-hooks/set-state-in-effect -- see above */
  useEffect(() => {
    if (!selectedAssistantId) {
      syncedAssistantId.current = null;
      pendingWebSearch.current = undefined;
      if (selectedToolId === 'web-search') setSelectedTool(null);
      return;
    }
    if (!selectedAssistant) return;

    if (syncedAssistantId.current !== selectedAssistantId) {
      syncedAssistantId.current = selectedAssistantId;
      pendingWebSearch.current = undefined;
      setSelectedTool(selectedAssistant.settings.enableWebSearch ? 'web-search' : null);
      return;
    }

    const pending = pendingWebSearch.current;
    if (pending?.assistantId === selectedAssistantId) {
      if (pending.enabled !== selectedAssistant.settings.enableWebSearch) return;
      pendingWebSearch.current = undefined;
    }

    const canonicalToolId = selectedAssistant.settings.enableWebSearch ? 'web-search' : null;
    if (selectedToolId === 'web-search' || selectedToolId === null) {
      if (selectedToolId !== canonicalToolId) setSelectedTool(canonicalToolId);
    }
  }, [selectedAssistant, selectedAssistantId, selectedToolId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const persistWebSearch = useCallback(
    (enabled: boolean) => {
      if (!selectedAssistantId || !selectedAssistant) return;
      const currentPending = pendingWebSearch.current;
      if (!currentPending && selectedAssistant.settings.enableWebSearch === enabled) return;

      if (currentPending?.assistantId === selectedAssistantId) {
        currentPending.enabled = enabled;
        if (currentPending.isUpdating) return;
      } else {
        pendingWebSearch.current = {
          assistantId: selectedAssistantId,
          enabled,
          isUpdating: false,
        };
      }

      void (async () => {
        while (pendingWebSearch.current?.assistantId === selectedAssistantId) {
          const pending = pendingWebSearch.current;
          const attemptedEnabled = pending.enabled;
          pending.isUpdating = true;

          try {
            await updateAssistant(selectedAssistantId, {
              settings: { enableWebSearch: attemptedEnabled },
            });
          } catch (error) {
            const latestPending: PendingWebSearchState | undefined = pendingWebSearch.current;
            if (
              latestPending?.assistantId !== selectedAssistantId ||
              latestPending.enabled === attemptedEnabled
            ) {
              pendingWebSearch.current = undefined;
              setSelectedTool(selectedAssistant.settings.enableWebSearch ? 'web-search' : null);
              perfLog.warn('Failed to persist web search state', { error });
              return;
            }
          }

          const latestPending: PendingWebSearchState | undefined = pendingWebSearch.current;
          if (
            latestPending?.assistantId !== selectedAssistantId ||
            latestPending.enabled === attemptedEnabled
          ) {
            if (latestPending) latestPending.isUpdating = false;
            return;
          }
          latestPending.isUpdating = false;
        }
      })();
    },
    [selectedAssistant, selectedAssistantId, setSelectedTool, updateAssistant],
  );
  const handleActionSelect = useCallback(
    (actionId: ChatInputActionId) => {
      const nextActionId = toggleChatInputAction(selectedToolId, actionId);
      setSelectedTool(nextActionId);
      if (actionId === 'web-search') {
        persistWebSearch(nextActionId === 'web-search');
      }
    },
    [persistWebSearch, selectedToolId, setSelectedTool],
  );
  const handleToolClear = useCallback(() => {
    setSelectedTool(null);
    if (selectedToolId === 'web-search') {
      persistWebSearch(false);
    }
  }, [persistWebSearch, selectedToolId, setSelectedTool]);
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
      <ComposerSurface
        canSend={
          !hasImportingComposerAttachments(attachments) &&
          hasComposerSendableContent(draft, attachments)
        }
        dismissKeyboardOnSend={dismissKeyboardOnSend}
        onSend={handleSendPress}
        onStop={chatTopic.abort}
        streaming={chatTopic.isBusy}
      >
        <Composer.Collapsible>
          {selectedTool ? <ChatInputToolTag onClear={handleToolClear} tool={selectedTool} /> : null}
        </Composer.Collapsible>
        <ComposerAttachments />
        <ComposerField />
        <Composer.Toolbar>
          <ComposerMenu>
            <ChatInputMenuItems
              onActionPress={handleActionSelect}
              selectedToolId={selectedToolId}
            />
          </ComposerMenu>
          <ComposerModelPill
            icon={selectedModelIcon}
            label={selectedModelLabel}
            onPress={openModelPicker}
          >
            {reasoningEfforts.length > 0 ? (
              <ChatInputEffortBadge reasoningEffort={reasoningEffort} />
            ) : null}
          </ComposerModelPill>
          <Composer.Send />
        </Composer.Toolbar>
      </ComposerSurface>
      {isModelPickerOpen ? (
        <ModelPickerBottomSheet
          footer={
            reasoningEfforts.length > 0 ? (
              <ChatInputReasoningSection
                reasoningEffort={reasoningEffort}
                onSelectReasoningEffort={handleReasoningEffortSelect}
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
