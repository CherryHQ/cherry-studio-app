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
import { loggerService } from '@/core/logger/LoggerService';
import {
  chatInputBottomToolbarHeight,
  chatInputCollapsedHeight,
  chatInputCollapsedWidth,
  chatInputCollapsedWidthRatio,
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
  assistantLabel?: string;
  isSendEnabled: boolean;
  isStreaming: boolean;
  modelLabel?: string;
  onAssistantPickerPress: () => void;
  onModelPickerPress: () => void;
  onSendPress: (payload: ChatInputSendPayload) => Promise<void>;
  onStopPress: () => void;
};

export type ChatInputSendPayload = {
  attachments: readonly ChatInputAttachmentDraft[];
  text: string;
};

export function ChatInputSurface({
  assistantLabel,
  isSendEnabled,
  isStreaming,
  modelLabel,
  onAssistantPickerPress,
  onModelPickerPress,
  onSendPress,
  onStopPress,
}: ChatInputSurfaceProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const {
    clearAttachments,
    clearReasoningEffort,
    clearSelectedTool,
    removeAttachment,
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
    selectedTool,
    shouldShowReasoningEffortTag,
  } = useChatInputState();
  const expandProgress = useSharedValue(0);
  const contentHeight = useSharedValue(0);
  const availableWidth = useSharedValue(0);
  // 内容层固定成展开宽度，不随每帧宽度动画重排：否则原生 TextInput 逐帧重排重绘会导致展开掉帧。
  const [contentWidth, setContentWidth] = useState<number | null>(null);

  useEffect(() => {
    expandProgress.value = withSpring(isComposerExpanded ? 1 : 0, chatInputSpringConfig);
  }, [isComposerExpanded, expandProgress]);

  const surfaceAnimatedStyle = useAnimatedStyle(() => ({
    height: interpolate(
      expandProgress.value,
      [0, 1],
      [chatInputCollapsedHeight, Math.max(contentHeight.value, chatInputCollapsedHeight)],
      Extrapolation.CLAMP,
    ),
    width: interpolate(
      expandProgress.value,
      [0, 1],
      [
        Math.max(availableWidth.value * chatInputCollapsedWidthRatio, chatInputCollapsedWidth),
        Math.max(availableWidth.value, chatInputCollapsedWidth),
      ],
      Extrapolation.CLAMP,
    ),
  }));
  const bottomToolbarAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(expandProgress.value, [0.4, 1], [0, 1], Extrapolation.CLAMP),
  }));
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
  const handleModelPickerPress = useCallback(() => {
    if (isInputFocused) {
      void KeyboardController.dismiss();
      inputRef.current?.blur();
      setInputFocused(false);
    }

    onModelPickerPress();
  }, [inputRef, isInputFocused, onModelPickerPress, setInputFocused]);
  const handleAssistantPickerPress = useCallback(() => {
    if (isInputFocused) {
      void KeyboardController.dismiss();
      inputRef.current?.blur();
      setInputFocused(false);
    }

    onAssistantPickerPress();
  }, [inputRef, isInputFocused, onAssistantPickerPress, setInputFocused]);
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
              <ChatInputToolbar
                shouldShowReasoningEffortTag={shouldShowReasoningEffortTag}
                selectedTool={selectedTool}
                onReasoningEffortClear={clearReasoningEffort}
                onToolClear={clearSelectedTool}
              />
              <ChatInputAttachmentPreviewStrip
                attachments={attachments}
                onAttachmentPreview={handleAttachmentPreview}
                onAttachmentRemove={removeAttachment}
              />
              <ChatInputTextArea />
              <Animated.View
                className="flex-row items-center gap-2 px-3 pb-1.5 pr-11"
                style={[inputBottomToolbarStyle, bottomToolbarAnimatedStyle]}
              >
                <ChatInputAddButton />
                <ChatInputPill
                  label={assistantLabel ?? t('chat.assistant.select')}
                  maxWidthClassName="max-w-[42%]"
                  onPress={handleAssistantPickerPress}
                />
                <ChatInputPill
                  label={modelLabel ?? t('chat.model.select')}
                  maxWidthClassName="max-w-[48%]"
                  onPress={handleModelPickerPress}
                />
              </Animated.View>
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
  label,
  maxWidthClassName,
  onPress,
}: {
  label: string;
  maxWidthClassName: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      className={`h-8 justify-center rounded-full bg-surface-secondary px-3 active:bg-surface-tertiary active:opacity-70 ${maxWidthClassName}`}
      onPress={onPress}
    >
      <Text className="font-semibold text-foreground text-sm" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
