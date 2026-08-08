import { REASONING_EFFORT } from '@cherrystudio/provider-registry';
import type { IconSource } from '@cherrystudio/ui/icons';
import { cn } from '@cherrystudio/ui/utils';
import { useToast } from 'heroui-native/toast';
import { Settings2Icon } from 'lucide-uniwind/png';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useUniwind } from 'uniwind';

import { Image } from '@/frontend/components/nativePrimitives';
import { loggerService } from '@/shared/core/logger/LoggerService';

import {
  chatInputBottomToolbarHeight,
  chatInputMinComposerHeight,
  chatInputMinSurfaceWidth,
  chatInputRestingWidthDelta,
} from '../chatInputLayout';
import {
  useChatInputActions,
  useChatInputMeta,
  useChatInputState,
} from '../context/ChatInputProvider';
import {
  hasImportingChatInputAttachments,
  isChatInputAttachmentReady,
  type ChatInputAttachmentReady,
} from '../utils/chatInputAttachments';
import { chatInputMotionConfig, chatInputSpringConfig } from '../utils/chatInputMotion';
import {
  type ChatInputReasoningEffort,
  getChatInputReasoningEffortOption,
} from '../utils/chatInputReasoning';
import { ChatInputAddButton } from './ChatInputAddButton';
import { ChatInputAttachmentPreviewStrip } from './ChatInputMediaStrip';
import { ChatInputPrimaryActionButton } from './ChatInputPrimaryActionButton';
import { ChatInputTextArea } from './ChatInputTextArea';
import { ChatInputToolbar } from './ChatInputToolbar';

const inputBottomToolbarStyle = {
  minHeight: chatInputBottomToolbarHeight,
};

const emptyReasoningEfforts: readonly ChatInputReasoningEffort[] = [];

const logger = loggerService.withContext('ChatInputSurface');

type ChatInputSurfaceProps = {
  allowEmptySend?: boolean;
  dismissKeyboardOnSend?: boolean;
  getSendErrorLabel?: (error: unknown) => string | undefined;
  isSendEnabled: boolean;
  isStreaming: boolean;
  /** Themed icon for the selected model; the button falls back to the label's initial. */
  modelIcon?: IconSource;
  modelLabel?: string;
  modelSettings?: ChatInputModelSettings;
  onModelPickerPress: () => void;
  onSendPress: (payload: ChatInputSendPayload) => Promise<void>;
  onStopPress: () => void;
  onToolClear?: () => void;
  /** Reasoning stops of the selected model; empty hides the effort label in the model pill. */
  reasoningEfforts?: readonly ChatInputReasoningEffort[];
};

export type ChatInputModelSettings = {
  accessibilityLabel: string;
  onPress: () => void;
};

export type ChatInputSendPayload = {
  attachments: readonly ChatInputAttachmentReady[];
  text: string;
};

export function ChatInputSurface({
  allowEmptySend = false,
  dismissKeyboardOnSend = true,
  getSendErrorLabel,
  isSendEnabled,
  isStreaming,
  modelIcon,
  modelLabel,
  modelSettings,
  onModelPickerPress,
  onSendPress,
  onStopPress,
  onToolClear,
  reasoningEfforts = emptyReasoningEfforts,
}: ChatInputSurfaceProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const {
    clearAttachments,
    clearSelectedTool,
    removeAttachment,
    setAttachments,
    setDraft,
    setInputFocused,
  } = useChatInputActions();
  const { inputRef } = useChatInputMeta();
  const { attachments, draft, isComposerExpanded, isInputFocused, reasoningEffort, selectedTool } =
    useChatInputState();
  const reasoningEffortLabelKey =
    reasoningEfforts.length > 0
      ? getChatInputReasoningEffortOption(reasoningEffort)?.labelKey
      : undefined;
  const expandProgress = useSharedValue(0);
  const contentHeight = useSharedValue(0);
  const availableWidth = useSharedValue(0);
  // 内容层固定成展开宽度，不随每帧宽度动画重排：否则原生 TextInput 逐帧重排重绘会导致展开掉帧。
  const [contentWidth, setContentWidth] = useState<number | null>(null);

  useEffect(() => {
    expandProgress.set(withSpring(isComposerExpanded ? 1 : 0, chatInputSpringConfig));
  }, [isComposerExpanded, expandProgress]);

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

      availableWidth.set(nextWidth);
      setContentWidth((current) => (current === nextWidth ? current : nextWidth));
    },
    [availableWidth],
  );
  const handleContentLayout = useCallback(
    (event: LayoutChangeEvent) => {
      contentHeight.set(withTiming(event.nativeEvent.layout.height, chatInputMotionConfig));
    },
    [contentHeight],
  );
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
  const handleModelSettingsPress = useCallback(() => {
    if (!modelSettings) {
      return;
    }
    dismissInput();
    modelSettings.onPress();
  }, [dismissInput, modelSettings]);
  const handleSendPress = useCallback(
    async (text: string) => {
      if (hasImportingChatInputAttachments(attachments)) {
        return;
      }
      const draftSnapshot = draft;
      const attachmentSnapshot = attachments.filter(isChatInputAttachmentReady);

      setDraft('');
      clearAttachments();
      if (dismissKeyboardOnSend) {
        setInputFocused(false);
        void KeyboardController.dismiss({ animated: false });
      }

      try {
        await onSendPress({ attachments: attachmentSnapshot, text });
      } catch (error) {
        // The toast is deliberately vague, so without this the failure leaves no
        // trace at all and there is nothing to go on when a send breaks on device.
        logger.error('Message send failed', error instanceof Error ? error : { error });
        setDraft(draftSnapshot);
        setAttachments(attachmentSnapshot);
        toast.show({
          label: getSendErrorLabel?.(error) ?? t('chat.input.sendFailed'),
          variant: 'danger',
        });
      }
    },
    [
      attachments,
      clearAttachments,
      dismissKeyboardOnSend,
      draft,
      getSendErrorLabel,
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
              <ChatInputToolbar
                selectedTool={selectedTool}
                onToolClear={onToolClear ?? clearSelectedTool}
              />
              <ChatInputAttachmentPreviewStrip
                attachments={attachments}
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
                {modelSettings ? (
                  <ChatInputSettingsButton
                    accessibilityLabel={modelSettings.accessibilityLabel}
                    onPress={handleModelSettingsPress}
                  />
                ) : null}
                {modelLabel ? (
                  <ChatInputModelButton
                    accessibilityLabel={modelLabel}
                    effortLabel={reasoningEffortLabelKey ? t(reasoningEffortLabelKey) : undefined}
                    icon={modelIcon}
                    initial={modelLabel.trim().charAt(0).toUpperCase() || 'M'}
                    isEffortMax={reasoningEffort === REASONING_EFFORT.MAX}
                    label={modelLabel}
                    onPress={handleModelPickerPress}
                  />
                ) : (
                  <ChatInputPill
                    label={t('chat.model.select')}
                    maxWidthClassName="max-w-[42%]"
                    onPress={handleModelPickerPress}
                  />
                )}
              </View>
            </View>
          </View>
          <ChatInputPrimaryActionButton
            allowEmptySend={allowEmptySend}
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

function ChatInputSettingsButton({
  accessibilityLabel,
  onPress,
}: {
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary active:bg-secondary-active active:opacity-70"
      onPress={onPress}
      testID="chat-input-model-settings-button"
    >
      <Settings2Icon className="size-4 text-foreground" strokeWidth={2} />
    </Pressable>
  );
}

function ChatInputModelButton({
  accessibilityLabel,
  effortLabel,
  icon,
  initial,
  isEffortMax = false,
  label,
  onPress,
}: {
  accessibilityLabel: string;
  /** Current reasoning effort of the model; rendered muted next to the name. */
  effortLabel?: string;
  icon?: IconSource;
  initial: string;
  /** The max stop stands out in Cherry's brand green instead of muted. */
  isEffortMax?: boolean;
  label: string;
  onPress: () => void;
}) {
  const { theme } = useUniwind();

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="h-8 min-w-0 shrink flex-row items-center gap-1.5 rounded-full bg-secondary px-2.5 active:bg-secondary-active active:opacity-70"
      onPress={onPress}
      testID="chat-input-model-button"
    >
      {icon ? (
        <Image
          cachePolicy="memory-disk"
          contentFit="contain"
          source={icon[theme === 'dark' ? 'dark' : 'light']}
          style={{ height: 18, width: 18 }}
        />
      ) : (
        <Text className="font-semibold text-foreground text-sm">{initial}</Text>
      )}
      <Text className="min-w-0 shrink font-semibold text-foreground text-sm" numberOfLines={1}>
        {label}
      </Text>
      {effortLabel ? (
        <Text
          className={cn('shrink-0 text-sm', isEffortMax ? 'text-brand' : 'text-foreground')}
          numberOfLines={1}
          testID="chat-input-model-effort-label"
        >
          {effortLabel}
        </Text>
      ) : null}
    </Pressable>
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
      className={`h-8 min-w-0 flex-row items-center justify-center gap-1.5 rounded-lg bg-secondary px-3 active:bg-secondary-active active:opacity-70 ${maxWidthClassName}`}
      onPress={onPress}
    >
      <Text className="font-semibold text-foreground text-sm" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
