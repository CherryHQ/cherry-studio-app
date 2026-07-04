import ExpoQuickLook from '@magrinj/expo-quick-look';
import { useToast } from 'heroui-native/toast';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { loggerService } from '@/core/logger/LoggerService';
import {
  chatInputBottomToolbarHeight,
  chatInputMinComposerHeight,
  chatInputMinSurfaceWidth,
  chatInputRestingWidthDelta,
} from '@/screens/ChatScreen/input/chatInputLayout';
import { ChatInputAddButton } from '@/screens/ChatScreen/input/components/ChatInputAddButton';
import { ChatInputAttachmentPreviewStrip } from '@/screens/ChatScreen/input/components/ChatInputMediaStrip';
import { ChatInputPrimaryActionButton } from '@/screens/ChatScreen/input/components/ChatInputPrimaryActionButton';
import { ChatInputTextArea } from '@/screens/ChatScreen/input/components/ChatInputTextArea';
import { ChatInputToolbar } from '@/screens/ChatScreen/input/components/ChatInputToolbar';
import {
  useChatInputActions,
  useChatInputMeta,
  useChatInputState,
} from '@/screens/ChatScreen/input/context/ChatInputProvider';
import type { ChatInputAttachmentDraft } from '@/screens/ChatScreen/input/utils/chatInputAttachments';
import {
  chatInputMotionConfig,
  chatInputSpringConfig,
} from '@/screens/ChatScreen/input/utils/chatInputMotion';
import {
  CHAT_INPUT_DEFAULT_REASONING_EFFORT,
  type ChatInputReasoningEffort,
  chatInputReasoningEffortOptions,
  getChatInputReasoningEffortBarCount,
  getChatInputReasoningEffortOption,
  getFallbackChatInputReasoningEffort,
  getNextChatInputReasoningEffort,
  isChatInputReasoningEffortAvailable,
  isChatInputReasoningEffortOff,
} from '@/screens/ChatScreen/input/utils/chatInputReasoning';

const inputBottomToolbarStyle = {
  minHeight: chatInputBottomToolbarHeight,
};

const reasoningMeterBarHeights = [6, 9, 12, 15, 18] as const;
const reasoningIconButtonWidth = 32;
const reasoningMeterBarStaggerMs = 20;
const reasoningMeterWidth = 28;
const reasoningPillContentGap = 6;
const reasoningPillHorizontalPadding = 12;
const reasoningPillBaseWidth =
  reasoningPillHorizontalPadding * 2 + reasoningMeterWidth + reasoningPillContentGap;
const reasoningSlotTextFallbackCharWidth = 14;
const reasoningSlotTextMinWidth = 8;
const reasoningSlotTextTravelDistance = 20;

type SlotTextWidthMap = Record<string, number>;

const logger = loggerService.withContext('ChatInputSurface');

type ChatInputSurfaceProps = {
  isSendEnabled: boolean;
  isStreaming: boolean;
  modelLabel?: string;
  onModelPickerPress: () => void;
  onSendPress: (payload: ChatInputSendPayload) => Promise<void>;
  onStopPress: () => void;
  reasoningEfforts?: readonly ChatInputReasoningEffort[];
};

export type ChatInputSendPayload = {
  attachments: readonly ChatInputAttachmentDraft[];
  text: string;
};

export function ChatInputSurface({
  isSendEnabled,
  isStreaming,
  modelLabel,
  onModelPickerPress,
  onSendPress,
  onStopPress,
  reasoningEfforts = [],
}: ChatInputSurfaceProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const {
    clearAttachments,
    clearReasoningEffort,
    clearSelectedTool,
    removeAttachment,
    selectReasoningEffort,
    setAttachments,
    setDraft,
    setInputFocused,
  } = useChatInputActions();
  const { inputRef } = useChatInputMeta();
  const {
    attachments,
    draft,
    isComposerExpanded,
    isInputFocused,
    isReasoningEffortSelected,
    reasoningEffort,
    selectedTool,
  } = useChatInputState();
  const shouldShowReasoningPill = reasoningEfforts.length > 0;
  const reasoningBarCount = getChatInputReasoningEffortBarCount(reasoningEffort);
  const isReasoningOff = isChatInputReasoningEffortOff(reasoningEffort);
  const reasoningOption = getChatInputReasoningEffortOption(reasoningEffort);
  const reasoningLabel = reasoningOption ? t(reasoningOption.labelKey) : t('chat.reasoning.title');
  const reasoningLabels = useMemo(
    () =>
      chatInputReasoningEffortOptions
        .filter(
          (option) =>
            reasoningEfforts.includes(option.value) && !isChatInputReasoningEffortOff(option.value),
        )
        .map((option) => t(option.labelKey)),
    [reasoningEfforts, t],
  );
  const expandProgress = useSharedValue(0);
  const contentHeight = useSharedValue(0);
  const availableWidth = useSharedValue(0);
  // 内容层固定成展开宽度，不随每帧宽度动画重排：否则原生 TextInput 逐帧重排重绘会导致展开掉帧。
  const [contentWidth, setContentWidth] = useState<number | null>(null);

  useEffect(() => {
    expandProgress.value = withSpring(isComposerExpanded ? 1 : 0, chatInputSpringConfig);
  }, [isComposerExpanded, expandProgress]);

  useEffect(() => {
    if (!shouldShowReasoningPill) {
      if (isReasoningEffortSelected || reasoningEffort !== CHAT_INPUT_DEFAULT_REASONING_EFFORT) {
        clearReasoningEffort();
      }
      return;
    }

    if (!isChatInputReasoningEffortAvailable(reasoningEffort, reasoningEfforts)) {
      selectReasoningEffort(getFallbackChatInputReasoningEffort(reasoningEfforts));
    }
  }, [
    clearReasoningEffort,
    isReasoningEffortSelected,
    reasoningEffort,
    reasoningEfforts,
    selectReasoningEffort,
    shouldShowReasoningPill,
  ]);

  const surfaceAnimatedStyle = useAnimatedStyle(() => {
    const fullWidth = Math.max(availableWidth.value, chatInputMinSurfaceWidth);

    return {
      // Always the full composer height — only the width changes between the
      // resting and focused states (the old collapsed pill clamped this to a
      // single placeholder row).
      height: Math.max(contentHeight.value, chatInputMinComposerHeight),
      width: interpolate(
        expandProgress.value,
        [0, 1],
        [Math.max(fullWidth - chatInputRestingWidthDelta, chatInputMinSurfaceWidth), fullWidth],
        Extrapolation.CLAMP,
      ),
    };
  });
  const handleWrapperLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextWidth = event.nativeEvent.layout.width;

      availableWidth.value = nextWidth;
      setContentWidth((current) => (current === nextWidth ? current : nextWidth));
    },
    [availableWidth],
  );
  const handleContentLayout = useCallback(
    (event: LayoutChangeEvent) => {
      contentHeight.value = withTiming(event.nativeEvent.layout.height, chatInputMotionConfig);
    },
    [contentHeight],
  );
  const handleAttachmentPreview = useCallback((attachment: ChatInputAttachmentDraft) => {
    void ExpoQuickLook.previewFile({
      editingMode: 'disabled',
      uri: attachment.uri,
    }).catch((error) => {
      logger.warn('Failed to preview attachment', error instanceof Error ? error : null);
    });
  }, []);
  const dismissInput = useCallback(() => {
    if (isInputFocused) {
      void KeyboardController.dismiss();
      inputRef.current?.blur();
      setInputFocused(false);
    }
  }, [inputRef, isInputFocused, setInputFocused]);
  const handleModelPickerPress = useCallback(() => {
    dismissInput();
    onModelPickerPress();
  }, [dismissInput, onModelPickerPress]);
  const handleReasoningPress = useCallback(() => {
    if (!shouldShowReasoningPill) {
      return;
    }

    selectReasoningEffort(getNextChatInputReasoningEffort(reasoningEffort, reasoningEfforts));
  }, [reasoningEffort, reasoningEfforts, selectReasoningEffort, shouldShowReasoningPill]);
  const handleSendPress = useCallback(
    async (text: string) => {
      const draftSnapshot = draft;
      const attachmentSnapshot = [...attachments];

      inputRef.current?.blur();
      setInputFocused(false);
      await KeyboardController.dismiss();
      setDraft('');
      clearAttachments();

      try {
        await onSendPress({ attachments: attachmentSnapshot, text });
      } catch {
        setDraft(draftSnapshot);
        setAttachments(attachmentSnapshot);
        toast.show({
          label: t('chat.input.sendFailed'),
          variant: 'danger',
        });
      }
    },
    [
      attachments,
      clearAttachments,
      draft,
      inputRef,
      onSendPress,
      setAttachments,
      setDraft,
      setInputFocused,
      t,
      toast,
    ],
  );

  return (
    <View className="flex-row items-end">
      <View className="flex-1" onLayout={handleWrapperLayout}>
        <Animated.View className="relative self-center" style={surfaceAnimatedStyle}>
          {/* 阴影层与裁剪层分开：阴影不压在 overflow-hidden 层上，避免逐帧离屏渲染算阴影 mask。 */}
          <View className="absolute inset-0 rounded-3xl bg-field ios:shadow-field android:shadow-sm" />
          <View className="absolute inset-0 overflow-hidden rounded-3xl">
            <View
              className="absolute top-0 left-0"
              style={{ width: contentWidth ?? '100%' }}
              onLayout={handleContentLayout}
            >
              <ChatInputToolbar selectedTool={selectedTool} onToolClear={clearSelectedTool} />
              <ChatInputAttachmentPreviewStrip
                attachments={attachments}
                onAttachmentPreview={handleAttachmentPreview}
                onAttachmentRemove={removeAttachment}
              />
              <ChatInputTextArea />
              {/* pr-16 (not pr-11) clears the send button at the resting width:
                  the button is pinned to the surface's right edge, so when the
                  surface is inset it sits ~28px further into this row. */}
              <View
                className="flex-row items-center gap-2 px-3 pb-1.5 pr-16"
                style={inputBottomToolbarStyle}
              >
                <ChatInputAddButton />
                <ChatInputPill
                  label={modelLabel ?? t('chat.model.select')}
                  maxWidthClassName="max-w-[42%]"
                  onPress={handleModelPickerPress}
                />
                {shouldShowReasoningPill ? (
                  <ChatInputReasoningPill
                    accessibilityLabel={t('chat.reasoning.title')}
                    activeBarCount={reasoningBarCount}
                    isOff={isReasoningOff}
                    label={reasoningLabel}
                    labels={reasoningLabels}
                    onPress={handleReasoningPress}
                  />
                ) : null}
              </View>
            </View>
          </View>
          <ChatInputPrimaryActionButton
            isSendEnabled={isSendEnabled}
            isStreaming={isStreaming}
            onSendPress={handleSendPress}
            onStopPress={onStopPress}
          />
        </Animated.View>
      </View>
    </View>
  );
}

function ChatInputPill({
  accessibilityLabel,
  label,
  maxWidthClassName,
  onPress,
}: {
  accessibilityLabel?: string;
  label: string;
  maxWidthClassName: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      className={`h-8 min-w-0 flex-row items-center justify-center gap-1.5 rounded-full bg-surface-secondary px-3 active:bg-surface-tertiary active:opacity-70 ${maxWidthClassName}`}
      onPress={onPress}
    >
      <Text className="font-semibold text-foreground text-sm" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function ChatInputReasoningPill({
  accessibilityLabel,
  activeBarCount,
  isOff,
  label,
  labels,
  onPress,
}: {
  accessibilityLabel: string;
  activeBarCount: number;
  isOff: boolean;
  label: string;
  labels: readonly string[];
  onPress: () => void;
}) {
  const [measuredTextWidths, setMeasuredTextWidths] = useState<SlotTextWidthMap>({});
  const resolvedSlotTextWidth = isOff ? 0 : getResolvedSlotTextWidth(label, measuredTextWidths);
  const pillWidth = useSharedValue(getReasoningPillWidth(isOff, resolvedSlotTextWidth));
  const slotWidth = useSharedValue(resolvedSlotTextWidth);
  const pillWidthStyle = useAnimatedStyle(() => ({
    width: pillWidth.value,
  }));
  const handleMeasureLabelLayout = useCallback((measuredLabel: string, width: number) => {
    setMeasuredTextWidths((current) =>
      current[measuredLabel] === width ? current : { ...current, [measuredLabel]: width },
    );
  }, []);

  useEffect(() => {
    const targetPillWidth = getReasoningPillWidth(isOff, resolvedSlotTextWidth);

    cancelAnimation(pillWidth);
    cancelAnimation(slotWidth);
    pillWidth.value = withTiming(targetPillWidth, chatInputMotionConfig);
    slotWidth.value = withTiming(resolvedSlotTextWidth, chatInputMotionConfig);
  }, [isOff, pillWidth, resolvedSlotTextWidth, slotWidth]);

  return (
    <Animated.View
      className={`h-8 shrink-0 overflow-hidden rounded-full ${isOff ? '' : 'bg-surface-secondary'}`}
      style={pillWidthStyle}
      testID="chat-input-reasoning-pill"
    >
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        className={`h-8 flex-1 flex-row items-center justify-center gap-1.5 ${
          isOff ? 'px-0 active:opacity-70' : 'px-3 active:bg-surface-tertiary active:opacity-70'
        }`}
        onPress={onPress}
      >
        <ChatInputReasoningMeter activeBarCount={activeBarCount} />
        {isOff ? null : (
          <ChatInputSlotText
            label={label}
            labels={labels}
            onLabelLayout={handleMeasureLabelLayout}
            slotWidth={slotWidth}
          />
        )}
      </Pressable>
    </Animated.View>
  );
}

function getReasoningPillWidth(isOff: boolean, slotTextWidth: number) {
  return isOff ? reasoningIconButtonWidth : reasoningPillBaseWidth + slotTextWidth;
}

function getFallbackSlotTextWidth(label: string) {
  const hasNonAscii = Array.from(label).some((character) => character.charCodeAt(0) > 255);
  const fallbackCharWidth = hasNonAscii ? reasoningSlotTextFallbackCharWidth : 7.5;

  return Math.max(label.length * fallbackCharWidth, reasoningSlotTextMinWidth);
}

function getResolvedSlotTextWidth(label: string, measuredTextWidths: SlotTextWidthMap) {
  return Math.max(measuredTextWidths[label] ?? 0, getFallbackSlotTextWidth(label));
}

function ChatInputSlotText({
  label,
  labels,
  onLabelLayout,
  slotWidth,
}: {
  label: string;
  labels: readonly string[];
  onLabelLayout: (label: string, width: number) => void;
  slotWidth: SharedValue<number>;
}) {
  const [currentLabel, setCurrentLabel] = useState(label);
  const [previousLabel, setPreviousLabel] = useState<string | null>(null);
  const slotProgress = useSharedValue(1);
  const labelsToMeasure = useMemo(() => Array.from(new Set([label, ...labels])), [label, labels]);

  useEffect(() => {
    if (label === currentLabel) {
      return;
    }

    cancelAnimation(slotProgress);
    setPreviousLabel(currentLabel);
    setCurrentLabel(label);
    slotProgress.value = 0;
    slotProgress.value = withTiming(1, chatInputMotionConfig, (isFinished) => {
      if (isFinished) {
        runOnJS(setPreviousLabel)(null);
      }
    });
  }, [currentLabel, label, slotProgress]);

  const previousTextStyle = useAnimatedStyle(() => ({
    opacity: interpolate(slotProgress.value, [0, 1], [1, 0], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(
          slotProgress.value,
          [0, 1],
          [0, -reasoningSlotTextTravelDistance],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));
  const currentTextStyle = useAnimatedStyle(() => ({
    opacity: interpolate(slotProgress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(
          slotProgress.value,
          [0, 1],
          [reasoningSlotTextTravelDistance, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));
  const slotWidthStyle = useAnimatedStyle(() => ({
    width: slotWidth.value,
  }));

  return (
    <View className="relative h-5 shrink-0">
      <View
        accessibilityElementsHidden
        className="absolute top-0 left-0 opacity-0"
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        {labelsToMeasure.map((labelToMeasure) => (
          <Text
            className="self-start font-semibold text-sm leading-5"
            key={labelToMeasure}
            numberOfLines={1}
            onLayout={(event) => onLabelLayout(labelToMeasure, event.nativeEvent.layout.width)}
          >
            {labelToMeasure}
          </Text>
        ))}
      </View>
      <Animated.View className="h-5 overflow-hidden" style={slotWidthStyle}>
        {previousLabel ? (
          <Animated.Text
            className="absolute inset-x-0 top-0 text-center font-semibold text-foreground text-sm leading-5"
            numberOfLines={1}
            style={previousTextStyle}
            testID="chat-input-reasoning-slot-previous-label"
          >
            {previousLabel}
          </Animated.Text>
        ) : null}
        <Animated.Text
          className="absolute inset-x-0 top-0 text-center font-semibold text-foreground text-sm leading-5"
          numberOfLines={1}
          style={currentTextStyle}
          testID="chat-input-reasoning-slot-label"
        >
          {currentLabel}
        </Animated.Text>
      </Animated.View>
    </View>
  );
}

function ChatInputReasoningMeter({ activeBarCount }: { activeBarCount: number }) {
  return (
    <View className="h-5 shrink-0 flex-row items-end justify-center gap-0.5" style={{ width: 28 }}>
      {reasoningMeterBarHeights.map((height, index) => (
        <ChatInputReasoningMeterBar
          height={height}
          index={index}
          isActive={index < activeBarCount}
          key={height}
        />
      ))}
    </View>
  );
}

function ChatInputReasoningMeterBar({
  height,
  index,
  isActive,
}: {
  height: number;
  index: number;
  isActive: boolean;
}) {
  const activeProgress = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    cancelAnimation(activeProgress);
    const delayMs = isActive
      ? index * reasoningMeterBarStaggerMs
      : (reasoningMeterBarHeights.length - index - 1) * reasoningMeterBarStaggerMs;

    activeProgress.value = withDelay(delayMs, withTiming(isActive ? 1 : 0, chatInputMotionConfig));
  }, [activeProgress, index, isActive]);

  const activeBarStyle = useAnimatedStyle(() => ({
    opacity: activeProgress.value,
  }));

  return (
    <View
      className="relative w-0.5 overflow-hidden rounded-full bg-default-foreground/30"
      style={{ height }}
    >
      <Animated.View className="absolute inset-0 rounded-full bg-accent" style={activeBarStyle} />
    </View>
  );
}
