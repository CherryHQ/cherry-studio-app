import { Composer } from '@cherrystudio/ui/components';
import { duration, easing } from '@cherrystudio/ui/motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useResolveClassNames } from 'uniwind';

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
import { usePluginCatalog, usePluginConnections } from '@/frontend/features/plugin';
import { useAgentApiById, useAgentMutations } from '@/frontend/hooks/agent';
import { loggerService } from '@/shared/core/logger/LoggerService';

import type { useAgentChatControls } from '../../runtime';
import { ChatInputEffortOverlay } from './components/ChatInputEffortOverlay';
import { ChatInputMenu } from './components/ChatInputMenu';
import { ChatInputPluginPopover } from './components/ChatInputPluginPopover';
import { useBlurComposerOnVisibleKeyboardHide } from './hooks/useBlurComposerOnVisibleKeyboardHide';
import { useChatInputAgentModelSelection } from './hooks/useChatInputAgentModelSelection';
import { useChatInputReasoningEfforts } from './hooks/useChatInputReasoningEfforts';
import { useChatInputReasoningEffortSelection } from './hooks/useChatInputReasoningEffortSelection';
import { toAgentInputParts } from './utils/agentInputParts';
import { getConnectedChatInputPlugins } from './utils/chatInputPlugins';
import { getChatInputReasoningEffortSnapshot } from './utils/chatInputReasoning';
import { readPluginMentions } from './utils/pluginMentions';
import { getSendErrorLabelKey } from './utils/sendErrorLabel';

type ChatInputProps = {
  agentId?: string;
  controls: ReturnType<typeof useAgentChatControls>;
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

export function ChatInput({ agentId, controls, dismissKeyboardOnSend, sessionId }: ChatInputProps) {
  const { t } = useTranslation();
  const { cancel, canSend, isApprovalPending, isBusy, sendMessage } = controls;
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
  const [isPluginPickerOpen, setIsPluginPickerOpen] = useState(false);
  const pluginCatalog = usePluginCatalog();
  const pluginConnections = usePluginConnections();
  const connectedPlugins =
    pluginCatalog.isError || pluginConnections.isError
      ? []
      : getConnectedChatInputPlugins(pluginCatalog.data, pluginConnections.data);
  const hasConnectedPlugins = connectedPlugins.length > 0;
  const pluginMenuRef = useRef<View>(null);
  const closePluginPicker = useCallback(() => setIsPluginPickerOpen(false), []);
  const isPluginPickerVisible = isPluginPickerOpen && !isApprovalPending && hasConnectedPlugins;
  if (isPluginPickerOpen && (isApprovalPending || !hasConnectedPlugins))
    setIsPluginPickerOpen(false);
  const { fontScale } = useWindowDimensions();
  const inputTextStyle = useResolveClassNames('text-base');
  const compactInputStyle = {
    maxHeight: Math.max(restingInputHeight, (inputTextStyle.fontSize ?? 16) * fontScale * 2),
  };
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
    ({ attachments, text }: ComposerSendPayload) => {
      setIsPluginPickerOpen(false);
      const { pluginServerIds, pluginReferences, text: prompt } = readPluginMentions(text);
      const parts = toAgentInputParts({ attachments, text: prompt }, pluginReferences);
      return sendMessage({
        parts,
        pluginServerIds,
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
      const key = getSendErrorLabelKey(error);
      return key ? t(key) : undefined;
    },
    [t],
  );

  return (
    <>
      <ChatInputPluginPopover
        plugins={connectedPlugins}
        onClose={closePluginPicker}
        open={isPluginPickerVisible}
        returnFocusRef={isApprovalPending ? undefined : pluginMenuRef}
      >
        <View
          accessibilityElementsHidden={isApprovalPending}
          importantForAccessibility={isApprovalPending ? 'no-hide-descendants' : 'auto'}
          pointerEvents={isApprovalPending ? 'none' : 'auto'}
        >
          <ChatInputEffortOverlay
            modelLabel={selectedModelLabel}
            onChange={selectReasoningEffort}
            reasoningEffort={reasoningEffort}
            reasoningEfforts={reasoningEfforts}
          >
            {(effortGauge) => (
              <ComposerSurface
                canSend={canSend}
                dismissKeyboardOnSend={dismissKeyboardOnSend}
                getSendErrorLabel={getSendErrorLabel}
                onSend={handleSendPress}
                onStop={() => void cancel()}
                streaming={isBusy}
                testID="chat-composer"
              >
                <View
                  accessibilityElementsHidden={isPluginPickerVisible}
                  importantForAccessibility={isPluginPickerVisible ? 'no-hide-descendants' : 'auto'}
                  pointerEvents={isPluginPickerVisible ? 'none' : 'auto'}
                  style={isPluginPickerVisible ? foldedAttachmentsStyle : undefined}
                >
                  <ComposerAttachments />
                </View>
                <Animated.View className="relative overflow-hidden" style={morphFrameStyle}>
                  <Animated.View className="absolute top-0 overflow-hidden" style={fieldFrameStyle}>
                    <View className="absolute top-0 right-0 left-0" onLayout={handleFieldLayout}>
                      <ComposerField
                        onBlur={handleInputBlur}
                        onFocus={handleInputFocus}
                        style={isPluginPickerVisible ? compactInputStyle : undefined}
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
                    <ChatInputMenu
                      onPickPlugins={
                        hasConnectedPlugins ? () => setIsPluginPickerOpen(true) : undefined
                      }
                      triggerRef={pluginMenuRef}
                    />
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
                      <Composer.Send
                        testID={isBusy ? 'chat-composer-stop' : 'chat-composer-send'}
                      />
                    </View>
                  </Animated.View>
                </Animated.View>
              </ComposerSurface>
            )}
          </ChatInputEffortOverlay>
        </View>
      </ChatInputPluginPopover>
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

// Temporarily reserve space for the picker without unmounting the editor or its attachments.
const foldedAttachmentsStyle = { height: 0, overflow: 'hidden' } as const;
