import { Composer } from '@cherrystudio/ui/components';
import { duration, easing } from '@cherrystudio/ui/motion';
import { useCallback, useRef, useState } from 'react';
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
  ModelPickerDrawer,
  ModelPickerIcon,
  type ModelPickerModelItem,
  useModelPickerData,
} from '@/frontend/components/modelPicker';
import { useAgentApiById, useAgentMutations } from '@/frontend/hooks/agent';
import { AgentProtocolError } from '@/shared/contracts/agent';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { useAgentChatControls } from '../runtime';
import { ChatInputEffortOverlay } from './components/ChatInputEffortOverlay';
import { useBlurComposerOnVisibleKeyboardHide } from './hooks/useBlurComposerOnVisibleKeyboardHide';
import { useChatInputAgentModelSelection } from './hooks/useChatInputAgentModelSelection';
import { useChatInputReasoningEfforts } from './hooks/useChatInputReasoningEfforts';
import { useChatInputReasoningEffortSelection } from './hooks/useChatInputReasoningEffortSelection';
import { toAgentInputParts } from './utils/agentInputParts';
import { getChatInputReasoningEffortSnapshot } from './utils/chatInputReasoning';

type ChatInputProps = {
  agentId?: string;
  dismissKeyboardOnSend?: boolean;
  sessionId?: string;
};

const logger = loggerService.withContext('ChatInput');
const restingInputHeight = 32;
const restingActionSlotWidth = restingInputHeight + 8;
const restingSecondaryControlScale = 0.92;
const activeToolbarGap = 16;
const focusTransitionMotion = {
  duration: duration.base,
  easing: easing.settle,
  reduceMotion: ReduceMotion.System,
} as const;

export function ChatInput({ agentId, dismissKeyboardOnSend, sessionId }: ChatInputProps) {
  const { t } = useTranslation();
  const { cancel, isBusy, sendMessage } = useAgentChatControls({ agentId, sessionId });
  const { agent } = useAgentApiById(agentId);
  const { updateAgent } = useAgentMutations();
  const modelPickerData = useModelPickerData({ modelType: 'text' });
  const persistModel = useCallback(
    (targetAgentId: string, modelId: ModelPickerModelItem['modelId']) =>
      updateAgent(targetAgentId, { modelId }),
    [updateAgent],
  );
  const handleModelPersistenceError = useCallback(
    (error: unknown, { agentId: targetAgentId, modelId }: { agentId: string; modelId: string }) => {
      logger.warn('Failed to persist Agent model selection', error as Error, {
        agentId: targetAgentId,
        modelId,
      });
    },
    [],
  );
  const { selectModel, selectedModelId } = useChatInputAgentModelSelection(
    agentId,
    agent,
    persistModel,
    handleModelPersistenceError,
  );
  const selectedModelItem = modelPickerData.getModelItem(selectedModelId);
  const selectedModel = selectedModelItem?.model;
  const selectedModelLabel = selectedModel?.name;
  const reasoningEfforts = useChatInputReasoningEfforts(selectedModel);
  const { isReasoningEffortSelected, reasoningEffort, selectReasoningEffort } =
    useChatInputReasoningEffortSelection(reasoningEfforts, agentId);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [isInputActive, setIsInputActive] = useState(false);
  const isInputActiveRef = useRef(false);
  const naturalFieldHeight = useRef(restingInputHeight);
  const { inputRef } = useComposerMeta();
  useBlurComposerOnVisibleKeyboardHide(inputRef);
  const focusProgress = useSharedValue(0);
  const fieldFrameHeight = useSharedValue(restingInputHeight);
  const morphFrameStyle = useAnimatedStyle(() => {
    const progress = focusProgress.get();

    return {
      height: fieldFrameHeight.get() + progress * (activeToolbarGap + restingInputHeight),
    };
  });
  const fieldFrameStyle = useAnimatedStyle(() => {
    const progress = focusProgress.get();

    return {
      height: fieldFrameHeight.get(),
      left: interpolate(progress, [0, 1], [restingActionSlotWidth, 0], Extrapolation.CLAMP),
      right: interpolate(progress, [0, 1], [restingActionSlotWidth, 0], Extrapolation.CLAMP),
    };
  });
  const controlsRowStyle = useAnimatedStyle(() => {
    const progress = focusProgress.get();

    return {
      transform: [
        {
          translateY: progress * (fieldFrameHeight.get() + activeToolbarGap),
        },
      ],
    };
  });
  // Keep GlassView's backdrop sampling intact: Reanimated opacity on an
  // ancestor writes a layer alpha that permanently strips the tools' fill.
  // The closed frame clips these controls after translation instead.
  const secondaryControlRevealStyle = useAnimatedStyle(() => {
    const progress = focusProgress.get();

    return {
      transform: [
        { translateY: (1 - progress) * restingInputHeight },
        {
          scale: interpolate(
            progress,
            [0, 1],
            [restingSecondaryControlScale, 1],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });
  const closeModelPicker = useCallback(() => setIsModelPickerOpen(false), []);
  const openModelPicker = useCallback(() => setIsModelPickerOpen(true), []);
  const handleFieldLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = Math.max(restingInputHeight, Math.ceil(event.nativeEvent.layout.height));
      if (naturalFieldHeight.current === nextHeight) {
        return;
      }

      naturalFieldHeight.current = nextHeight;
      if (isInputActiveRef.current) {
        fieldFrameHeight.set(nextHeight);
      }
    },
    [fieldFrameHeight],
  );
  const handleInputBlur = useCallback(() => {
    if (!isInputActiveRef.current) {
      return;
    }

    isInputActiveRef.current = false;
    setIsInputActive(false);
    focusProgress.set(withTiming(0, focusTransitionMotion));
    fieldFrameHeight.set(withTiming(restingInputHeight, focusTransitionMotion));
  }, [fieldFrameHeight, focusProgress]);
  const handleInputFocus = useCallback(() => {
    isInputActiveRef.current = true;
    setIsInputActive(true);
    focusProgress.set(withTiming(1, focusTransitionMotion));
    fieldFrameHeight.set(withTiming(naturalFieldHeight.current, focusTransitionMotion));
  }, [fieldFrameHeight, focusProgress]);
  const handleModelSelect = useCallback(
    (item: ModelPickerModelItem) => {
      setIsModelPickerOpen(false);
      if (!agentId || selectedModelId === item.modelId) {
        return;
      }

      selectModel(item.modelId);
    },
    [agentId, selectModel, selectedModelId],
  );
  const handleSendPress = useCallback(
    ({ attachments, text }: ComposerSendPayload) => {
      const parts = toAgentInputParts({ attachments, text });
      return sendMessage({
        parts,
        ...(selectedModelId ? { modelId: selectedModelId } : {}),
        ...(reasoningEfforts.length > 0
          ? {
              reasoningEffort: getChatInputReasoningEffortSnapshot(
                reasoningEffort,
                isReasoningEffortSelected,
                reasoningEfforts,
              ),
            }
          : {}),
      });
    },
    [isReasoningEffortSelected, reasoningEffort, reasoningEfforts, selectedModelId, sendMessage],
  );
  const getSendErrorLabel = useCallback(
    (error: unknown) => {
      if (!(error instanceof AgentProtocolError)) {
        return undefined;
      }
      if (error.view.code === 'ATTACHMENT_INVALID') {
        return error.view.message;
      }
      if (error.view.code === 'CAPABILITY_UNSUPPORTED') {
        return t('chat.input.attachmentsRejected');
      }
      if (
        error.view.code === 'ATTACHMENT_UNAVAILABLE' ||
        error.view.code === 'ATTACHMENT_METADATA_MISMATCH'
      ) {
        return t('chat.input.attachmentUnavailable');
      }
      return undefined;
    },
    [t],
  );

  return (
    <>
      <ChatInputEffortOverlay
        modelLabel={selectedModelLabel}
        onChange={selectReasoningEffort}
        reasoningEffort={reasoningEffort}
        reasoningEfforts={reasoningEfforts}
      >
        {(effortGauge) => (
          <ComposerSurface
            dismissKeyboardOnSend={dismissKeyboardOnSend}
            getSendErrorLabel={getSendErrorLabel}
            onSend={handleSendPress}
            onStop={() => void cancel()}
            streaming={isBusy}
          >
            <ComposerAttachments />
            <Animated.View className="relative overflow-hidden" style={morphFrameStyle}>
              <Animated.View className="absolute top-0 overflow-hidden" style={fieldFrameStyle}>
                <View className="absolute top-0 right-0 left-0" onLayout={handleFieldLayout}>
                  <ComposerField onBlur={handleInputBlur} onFocus={handleInputFocus} />
                </View>
              </Animated.View>
              <Animated.View
                className="absolute top-0 right-0 left-0 flex-row items-center gap-2"
                pointerEvents="box-none"
                style={controlsRowStyle}
              >
                {/* The primary actions stay reachable before the field is focused. */}
                <ComposerMenu />
                <Animated.View
                  accessibilityElementsHidden={!isInputActive}
                  className="min-w-0 shrink"
                  importantForAccessibility={isInputActive ? 'auto' : 'no-hide-descendants'}
                  pointerEvents={isInputActive ? 'auto' : 'none'}
                  style={secondaryControlRevealStyle}
                >
                  <ComposerModelPill
                    icon={
                      selectedModelItem ? (
                        <ModelPickerIcon
                          model={selectedModelItem.model}
                          provider={selectedModelItem.provider}
                          providerIconSize={18}
                          size={20}
                        />
                      ) : undefined
                    }
                    label={selectedModelLabel}
                    onPress={openModelPicker}
                  />
                </Animated.View>
                <View className="ml-auto flex-row items-center gap-2" pointerEvents="box-none">
                  {effortGauge ? (
                    <Animated.View
                      accessibilityElementsHidden={!isInputActive}
                      importantForAccessibility={isInputActive ? 'auto' : 'no-hide-descendants'}
                      pointerEvents={isInputActive ? 'auto' : 'none'}
                      style={secondaryControlRevealStyle}
                    >
                      {effortGauge}
                    </Animated.View>
                  ) : null}
                  <Composer.Send />
                </View>
              </Animated.View>
            </Animated.View>
          </ComposerSurface>
        )}
      </ChatInputEffortOverlay>
      {isModelPickerOpen ? (
        <ModelPickerDrawer
          modelType="text"
          open
          onClose={closeModelPicker}
          onSelect={handleModelSelect}
          selectedModelId={selectedModelId}
        />
      ) : null}
    </>
  );
}
