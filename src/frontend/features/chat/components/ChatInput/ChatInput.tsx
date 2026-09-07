import { ActionMenu, Button, Composer, useToast } from '@cherrystudio/ui/components';
import { duration, easing } from '@cherrystudio/ui/motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useOpenProviderSetup } from '@/frontend/appShell/navigation';
import { chatReturnToHref } from '@/frontend/appShell/navigation/chat';
import {
  ComposerAttachments,
  ComposerField,
  ComposerModelPill,
  type ComposerSendPayload,
  ComposerSurface,
  useComposerMeta,
  useComposerState,
} from '@/frontend/components/Composer';
import {
  ModelPickerDrawer,
  ModelPickerIcon,
  type ModelPickerModelItem,
  useModelPickerData,
} from '@/frontend/components/ModelPicker';
import { useAgentApiById, useAgentMutations } from '@/frontend/hooks/agent';
import type { AgentSubmitMessageInput } from '@/shared/contracts/agent';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { useAgentChatControls } from '../../runtime';
import { ChatInputEffortOverlay } from './components/ChatInputEffortOverlay';
import { ChatInputMenu } from './components/ChatInputMenu';
import { ChatInputQueue } from './components/ChatInputQueue';
import { useBlurComposerOnVisibleKeyboardHide } from './hooks/useBlurComposerOnVisibleKeyboardHide';
import { useChatInputAgentModelSelection } from './hooks/useChatInputAgentModelSelection';
import { useChatInputReasoningEfforts } from './hooks/useChatInputReasoningEfforts';
import { useChatInputReasoningEffortSelection } from './hooks/useChatInputReasoningEffortSelection';
import { toAgentInputParts } from './utils/agentInputParts';
import { getChatInputReasoningEffortSnapshot } from './utils/chatInputReasoning';
import { createChatInputSubmission } from './utils/chatInputSubmission';
import { getSendErrorLabelKey } from './utils/sendErrorLabel';

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
const activeTransitionMotion = {
  duration: duration.base,
  easing: easing.settle,
  reduceMotion: ReduceMotion.System,
} as const;

export function ChatInput({ agentId, dismissKeyboardOnSend, sessionId }: ChatInputProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [submission] = useState(createChatInputSubmission);
  const [steeringTarget, setSteeringTarget] = useState<string>();
  const { cancel, activeTurnId, isBusy, sendMessage } = useAgentChatControls({
    agentId,
    sessionId,
  });
  const { agent } = useAgentApiById(agentId);
  const { updateAgent } = useAgentMutations();
  const modelPickerData = useModelPickerData({ modelType: 'text' });
  const providerSetupReturnTo = sessionId
    ? chatReturnToHref({ kind: 'session', sessionId })
    : agentId
      ? chatReturnToHref({ agentId, kind: 'draft' })
      : '/';
  const openProviderSetup = useOpenProviderSetup(providerSetupReturnTo);
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
  const [isInputFocused, setIsInputFocused] = useState(false);
  const { attachments, draft } = useComposerState();
  const isInputActive = isInputFocused || draft.length > 0 || attachments.length > 0;
  const naturalFieldHeight = useRef(restingInputHeight);
  const { inputRef } = useComposerMeta();
  useBlurComposerOnVisibleKeyboardHide(inputRef);
  const activeProgress = useSharedValue(isInputActive ? 1 : 0);
  const fieldFrameHeight = useSharedValue(restingInputHeight);

  useEffect(() => {
    activeProgress.set(withTiming(isInputActive ? 1 : 0, activeTransitionMotion));
    fieldFrameHeight.set(
      withTiming(
        isInputActive ? naturalFieldHeight.current : restingInputHeight,
        activeTransitionMotion,
      ),
    );
  }, [activeProgress, fieldFrameHeight, isInputActive]);

  const morphFrameStyle = useAnimatedStyle(() => {
    const progress = activeProgress.get();

    return {
      height: fieldFrameHeight.get() + progress * (activeToolbarGap + restingInputHeight),
    };
  });
  const fieldFrameStyle = useAnimatedStyle(() => {
    const progress = activeProgress.get();

    return {
      height: fieldFrameHeight.get(),
      left: interpolate(progress, [0, 1], [restingActionSlotWidth, 0], Extrapolation.CLAMP),
      right: interpolate(progress, [0, 1], [restingActionSlotWidth, 0], Extrapolation.CLAMP),
    };
  });
  const controlsRowStyle = useAnimatedStyle(() => {
    const progress = activeProgress.get();

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
    const progress = activeProgress.get();

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
      if (isInputActive) {
        fieldFrameHeight.set(nextHeight);
      }
    },
    [fieldFrameHeight, isInputActive],
  );
  const handleInputBlur = useCallback(() => {
    setIsInputFocused(false);
  }, []);
  const handleInputFocus = useCallback(() => {
    setIsInputFocused(true);
  }, []);
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
  const handleAddProvider = useCallback(() => {
    setIsModelPickerOpen(false);
    openProviderSetup();
  }, [openProviderSetup]);
  const handleSendPress = useCallback(
    async ({ attachments, text }: ComposerSendPayload) => {
      const parts = toAgentInputParts({ attachments, text });
      const input = {
        sessionId: sessionId ?? agentId ?? '',
        mode: steeringTarget ? 'steer' : 'follow-up',
        ...(steeringTarget ? { targetTurnId: steeringTarget } : {}),
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
      } satisfies Omit<AgentSubmitMessageInput, 'inputId'>;
      const inputId = submission.identify(input);
      const { sessionId: _identityScope, ...payload } = input;
      const result = await sendMessage({ ...payload, inputId });
      submission.accept(inputId);
      setSteeringTarget(undefined);
      if (result && result.disposition !== 'started') {
        toast.show({
          label: t(
            result.disposition === 'redirected'
              ? 'chat.input.queue.redirected'
              : 'chat.input.queue.accepted',
          ),
          variant: 'success',
        });
      }
    },
    [
      agentId,
      isReasoningEffortSelected,
      reasoningEffort,
      reasoningEfforts,
      selectedModelId,
      sendMessage,
      sessionId,
      steeringTarget,
      submission,
      t,
      toast,
    ],
  );
  const getSendErrorLabel = useCallback(
    (error: unknown) => {
      const key = getSendErrorLabelKey(error);
      return key ? t(key) : undefined;
    },
    [t],
  );

  return (
    <>
      <View className="gap-2">
        <ChatInputQueue sessionId={sessionId} targetTurnId={activeTurnId} />
        {isBusy || steeringTarget ? (
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <ActionMenu
              items={[
                {
                  id: 'follow-up',
                  label: t('chat.input.queue.followUp'),
                  checked: !steeringTarget,
                  onPress: () => setSteeringTarget(undefined),
                },
                {
                  id: 'steer',
                  label: t('chat.input.queue.steer'),
                  checked: !!steeringTarget,
                  disabled: !activeTurnId || attachments.length > 0,
                  onPress: () => setSteeringTarget(activeTurnId),
                },
              ]}
            >
              <Button size="sm" variant="ghost">
                <Button.Label>
                  {t(steeringTarget ? 'chat.input.queue.steer' : 'chat.input.queue.followUp')}
                </Button.Label>
              </Button>
            </ActionMenu>
            {isBusy ? (
              <Button
                size="sm"
                variant="ghost"
                testID="chat-composer-stop"
                onPress={() =>
                  void cancel().catch(() => {
                    toast.show({ label: t('chat.input.stopFailed'), variant: 'danger' });
                  })
                }
              >
                <Button.Label>{t('chat.input.action.stopGenerating')}</Button.Label>
              </Button>
            ) : null}
          </View>
        ) : null}
        {steeringTarget ? (
          <Text className="text-muted-foreground text-xs">
            {t(
              steeringTarget === activeTurnId
                ? 'chat.input.queue.steerHint'
                : 'chat.input.queue.targetEnded',
            )}
          </Text>
        ) : null}
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
              testID="chat-composer"
            >
              <ComposerAttachments />
              <Animated.View className="relative overflow-hidden" style={morphFrameStyle}>
                <Animated.View className="absolute top-0 overflow-hidden" style={fieldFrameStyle}>
                  <View className="absolute top-0 right-0 left-0" onLayout={handleFieldLayout}>
                    <ComposerField
                      onBlur={handleInputBlur}
                      onFocus={handleInputFocus}
                      testID="chat-composer-input"
                    />
                  </View>
                </Animated.View>
                <Animated.View
                  className="absolute top-0 right-0 left-0 flex-row items-center gap-2"
                  pointerEvents="box-none"
                  style={controlsRowStyle}
                >
                  {/* The primary actions stay reachable while the field is empty and unfocused. */}
                  <ChatInputMenu />
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
                    <Composer.Send action="send" testID="chat-composer-send" />
                  </View>
                </Animated.View>
              </Animated.View>
            </ComposerSurface>
          )}
        </ChatInputEffortOverlay>
      </View>
      {isModelPickerOpen ? (
        <ModelPickerDrawer
          modelType="text"
          open
          onAddProvider={handleAddProvider}
          onClose={closeModelPicker}
          onSelect={handleModelSelect}
          selectedModelId={selectedModelId}
        />
      ) : null}
    </>
  );
}
