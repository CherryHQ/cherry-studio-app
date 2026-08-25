import { Composer } from '@cherrystudio/ui/components';
import { duration, easing } from '@cherrystudio/ui/motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

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
  ModelPickerDrawer,
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

import { useChatTopicControls } from '../runtime';
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

// This constrains the clip around the editor, never the native editor itself,
// so the active multiline field and its selectable region share one geometry.
const restingInputHeight = 32;
const restingActionSlotWidth = restingInputHeight + 8;
const focusTransitionMotion = {
  duration: duration.base,
  easing: easing.settle,
  reduceMotion: ReduceMotion.System,
} as const;

// 诊断埋点：量化输入框「真实 model 名」解析耗时（pref 段 + model DB 段）。`[PERF]` 前缀。
const perfLog = loggerService.withContext('ChatPerf');

export function ChatInput({ assistantId, dismissKeyboardOnSend, topicId }: ChatInputProps) {
  const { t } = useTranslation();
  const modelSettings = useModelSettingSelections();
  const rawDefaultModel = modelSettings.selections.default;
  const defaultModelId = isUniqueModelId(rawDefaultModel) ? rawDefaultModel : null;
  const { abort, isBusy, sendText } = useChatTopicControls(topicId);
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
  const [isInputActive, setIsInputActive] = useState(false);
  const focusProgress = useSharedValue(0);
  const fieldFrameHeight = useSharedValue(restingInputHeight);
  const naturalFieldHeight = useRef(restingInputHeight);
  const fieldFrameStyle = useAnimatedStyle(() => ({ height: fieldFrameHeight.value }));
  const restingActionSlotStyle = useAnimatedStyle(() => ({
    opacity: interpolate(focusProgress.value, [0, 1], [1, 0], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(focusProgress.value, [0, 1], [1, 0.88], Extrapolation.CLAMP),
      },
      {
        translateY: interpolate(focusProgress.value, [0, 1], [0, 4], Extrapolation.CLAMP),
      },
    ],
    width: interpolate(
      focusProgress.value,
      [0, 1],
      [restingActionSlotWidth, 0],
      Extrapolation.CLAMP,
    ),
  }));
  const closeModelPicker = useCallback(() => setIsModelPickerOpen(false), []);
  const handleFieldLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = Math.max(restingInputHeight, Math.ceil(event.nativeEvent.layout.height));

      if (naturalFieldHeight.current === nextHeight) {
        return;
      }

      naturalFieldHeight.current = nextHeight;
      if (isInputActive) {
        // Content growth while editing must expose the caret immediately. The
        // focus transition is animated; typing-induced measurement is not.
        fieldFrameHeight.set(nextHeight);
      }
    },
    [fieldFrameHeight, isInputActive],
  );
  const handleInputBlur = useCallback(() => {
    setIsInputActive(false);
    fieldFrameHeight.set(withTiming(restingInputHeight, focusTransitionMotion));
  }, [fieldFrameHeight]);
  const handleInputFocus = useCallback(() => {
    setIsInputActive(true);
    fieldFrameHeight.set(withTiming(naturalFieldHeight.current, focusTransitionMotion));
  }, [fieldFrameHeight]);
  const openModelPicker = useCallback(() => setIsModelPickerOpen(true), []);
  const { updateAssistant } = useAssistantMutations();
  const { inputRef } = useComposerMeta();

  useEffect(() => {
    focusProgress.set(withTiming(isInputActive ? 1 : 0, focusTransitionMotion));
  }, [focusProgress, isInputActive]);

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

      return sendText({
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
      isReasoningEffortSelected,
      reasoningEffort,
      reasoningEfforts,
      selectedAssistant?.settings.reasoning_effort,
      selectedAssistantId,
      selectedModelId,
      sendText,
    ],
  );

  return (
    <>
      <ChatInputEffortOverlay
        modelLabel={selectedModelLabel}
        onChange={handleReasoningEffortSelect}
        reasoningEffort={reasoningEffort}
        reasoningEfforts={reasoningEfforts}
      >
        {(effortGauge) => {
          const menu = (
            <ComposerMenu>
              <ChatInputMenuItems
                isWebSearchEnabled={isWebSearchEnabled}
                onMentionPress={handleMentionPress}
                onWebSearchChange={setWebSearchEnabled}
              />
            </ComposerMenu>
          );

          return (
            <ComposerSurface
              dismissKeyboardOnSend={dismissKeyboardOnSend}
              onSend={handleSendPress}
              onStop={abort}
              streaming={isBusy}
            >
              <ComposerAttachments />
              {/* Keep one native field in one slot; only the controls change around it. */}
              <View className="flex-row items-center">
                <Animated.View
                  accessibilityElementsHidden={isInputActive}
                  className="items-start"
                  importantForAccessibility={isInputActive ? 'no-hide-descendants' : 'auto'}
                  pointerEvents={isInputActive ? 'none' : 'auto'}
                  style={restingActionSlotStyle}
                >
                  {menu}
                </Animated.View>
                <Animated.View className="min-w-0 flex-1 overflow-hidden" style={fieldFrameStyle}>
                  <View className="absolute top-0 right-0 left-0" onLayout={handleFieldLayout}>
                    <ComposerField onBlur={handleInputBlur} onFocus={handleInputFocus} />
                  </View>
                </Animated.View>
                <Animated.View
                  accessibilityElementsHidden={isInputActive}
                  className="items-end"
                  importantForAccessibility={isInputActive ? 'no-hide-descendants' : 'auto'}
                  pointerEvents={isInputActive ? 'none' : 'auto'}
                  style={restingActionSlotStyle}
                >
                  <Composer.Send />
                </Animated.View>
              </View>
              <Composer.Collapsible>
                {isInputActive ? (
                  <Composer.Toolbar>
                    {menu}
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
                ) : null}
              </Composer.Collapsible>
            </ComposerSurface>
          );
        }}
      </ChatInputEffortOverlay>
      {isModelPickerOpen ? (
        <ModelPickerDrawer
          open
          onClose={closeModelPicker}
          onSelect={handleModelSelect}
          selectedModelId={selectedModelId}
        />
      ) : null}
    </>
  );
}
