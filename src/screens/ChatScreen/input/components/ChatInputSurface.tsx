import ExpoQuickLook from '@magrinj/expo-quick-look';
import { useToast } from 'heroui-native/toast';
import { useCallback, useEffect } from 'react';
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
import { loggerService } from '@/core/logger/loggerService';
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
  isSendEnabled: boolean;
  isStreaming: boolean;
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
  modelLabel,
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
  const { attachments, draft, isComposerExpanded, selectedTool, shouldShowReasoningEffortTag } =
    useChatInputState();
  const expandProgress = useSharedValue(0);
  const contentHeight = useSharedValue(0);
  const availableWidth = useSharedValue(0);

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
      availableWidth.value = event.nativeEvent.layout.width;
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
        <Animated.View
          className="relative self-center overflow-hidden rounded-3xl bg-field ios:shadow-field android:shadow-sm"
          style={surfaceAnimatedStyle}
        >
          <View className="absolute inset-x-0 top-0" onLayout={handleContentLayout}>
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
              <ModelPickerPill label={modelLabel} onPress={onModelPickerPress} />
            </Animated.View>
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

function ModelPickerPill({ label, onPress }: { label?: string; onPress: () => void }) {
  const { t } = useTranslation();
  const resolvedLabel = label ?? t('chat.model.select');

  return (
    <Pressable
      accessibilityLabel={resolvedLabel}
      accessibilityRole="button"
      className="h-8 max-w-[68%] justify-center rounded-full bg-surface-secondary px-3 active:bg-surface-tertiary active:opacity-70"
      onPress={onPress}
    >
      <Text className="font-semibold text-foreground text-sm" numberOfLines={1}>
        {resolvedLabel}
      </Text>
    </Pressable>
  );
}
