import ExpoQuickLook from '@magrinj/expo-quick-look';
import { useToast } from 'heroui-native/toast';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';
import Animated from 'react-native-reanimated';
import { loggerService } from '@/core/logger/loggerService';
import {
  chatInputBottomToolbarHeight,
  chatInputMinComposerHeight,
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
import { chatInputLayoutTransition } from '@/screens/ChatScreen/input/utils/chatInputMotion';

const inputControlSurfaceStyle = {
  minHeight: chatInputMinComposerHeight,
};

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
  const { attachments, draft, isInputFocused, selectedTool, shouldShowReasoningEffortTag } =
    useChatInputState();
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
      <Animated.View className="flex-1" layout={chatInputLayoutTransition}>
        <Animated.View
          className="relative overflow-hidden rounded-3xl bg-field ios:shadow-field android:shadow-sm"
          layout={chatInputLayoutTransition}
          style={inputControlSurfaceStyle}
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
          <View
            className="flex-row items-center gap-2 px-3 pb-1.5 pr-11"
            style={inputBottomToolbarStyle}
          >
            <ChatInputAddButton />
            <ModelPickerPill label={modelLabel} onPress={handleModelPickerPress} />
          </View>
          <ChatInputPrimaryActionButton
            isSendEnabled={isSendEnabled}
            isStreaming={isStreaming}
            onSendPress={handleSendPress}
            onStopPress={onStopPress}
          />
        </Animated.View>
      </Animated.View>
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
