import type { IconPngSource } from '@cherrystudio/ui/icons';
import ExpoQuickLook from '@magrinj/expo-quick-look';
import { useToast } from 'heroui-native/toast';
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
import { Image } from '@/components/uniwind';
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

const inputBottomToolbarStyle = {
  minHeight: chatInputBottomToolbarHeight,
};

const logger = loggerService.withContext('ChatInputSurface');

type ChatInputSurfaceProps = {
  isSendEnabled: boolean;
  isStreaming: boolean;
  /** Themed icon for the selected model; the button falls back to the label's initial. */
  modelIcon?: IconPngSource;
  modelLabel?: string;
  onModelPickerPress: () => void;
  onSendPress: (payload: ChatInputSendPayload) => Promise<void>;
  onStopPress: () => void;
};

export type ChatInputSendPayload = {
  attachments: readonly ChatInputAttachmentDraft[];
  text: string;
};

export function ChatInputSurface({
  isSendEnabled,
  isStreaming,
  modelIcon,
  modelLabel,
  onModelPickerPress,
  onSendPress,
  onStopPress,
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
  const { attachments, draft, isComposerExpanded, isInputFocused, selectedTool } =
    useChatInputState();
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
                {modelLabel ? (
                  <ChatInputModelButton
                    accessibilityLabel={modelLabel}
                    icon={modelIcon}
                    initial={modelLabel.trim().charAt(0).toUpperCase() || 'M'}
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

function ChatInputModelButton({
  accessibilityLabel,
  icon,
  initial,
  onPress,
}: {
  accessibilityLabel: string;
  icon?: IconPngSource;
  initial: string;
  onPress: () => void;
}) {
  const { theme } = useUniwind();

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-secondary active:bg-surface-tertiary active:opacity-70"
      onPress={onPress}
      testID="chat-input-model-button"
    >
      {icon ? (
        <Image
          cachePolicy="memory-disk"
          contentFit="contain"
          source={icon[theme === 'dark' ? 'dark' : 'light']}
          style={{ height: 22, width: 22 }}
        />
      ) : (
        <Text className="font-semibold text-foreground text-sm">{initial}</Text>
      )}
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
      className={`h-8 min-w-0 flex-row items-center justify-center gap-1.5 rounded-lg bg-surface-secondary px-3 active:bg-surface-tertiary active:opacity-70 ${maxWidthClassName}`}
      onPress={onPress}
    >
      <Text className="font-semibold text-foreground text-sm" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
