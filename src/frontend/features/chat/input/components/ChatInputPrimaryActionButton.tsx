import { cn } from '@cherrystudio/ui/utils';
import { ArrowUpIcon, SquareIcon } from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { useChatInputMeta, useChatInputState } from '../context/ChatInputProvider';
import {
  hasChatInputSendableContent,
  hasImportingChatInputAttachments,
} from '../utils/chatInputAttachments';

const buttonSize = 32;

type ChatInputPrimaryActionButtonProps = {
  allowEmptySend?: boolean;
  isSendEnabled: boolean;
  isStreaming: boolean;
  onSendPress: (text: string) => void | Promise<void>;
  onStopPress: () => void;
};

export function ChatInputPrimaryActionButton({
  allowEmptySend = false,
  isSendEnabled,
  isStreaming,
  onSendPress,
  onStopPress,
}: ChatInputPrimaryActionButtonProps) {
  const { t } = useTranslation();
  const { inputRef } = useChatInputMeta();
  const { attachments, draft } = useChatInputState();
  const trimmedDraft = draft.trim();
  const isImporting = hasImportingChatInputAttachments(attachments);
  const isDisabled = isImporting && !isStreaming;
  const shouldShowSend =
    !isImporting &&
    isSendEnabled &&
    (allowEmptySend || hasChatInputSendableContent(draft, attachments));
  // Persistent button: stays mounted even with no sendable content; tapping it
  // focuses the input to expand the composer.
  const isPlaceholder = !isStreaming && !shouldShowSend;
  const Icon = isStreaming ? SquareIcon : ArrowUpIcon;
  const accessibilityLabel = isStreaming
    ? t('chat.input.action.stopGenerating')
    : t('chat.input.action.sendMessage');

  const handlePress = async () => {
    if (isStreaming) {
      onStopPress();
      return;
    }

    if (shouldShowSend) {
      await onSendPress(trimmedDraft);
      return;
    }

    inputRef.current?.focus();
  };

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      className={cn(
        'absolute right-1.5 bottom-1.5 items-center justify-center rounded-full bg-primary active:opacity-70',
        isPlaceholder && 'opacity-40',
      )}
      hitSlop={6}
      disabled={isDisabled}
      onPress={handlePress}
      style={{
        height: buttonSize,
        width: buttonSize,
      }}
    >
      <Icon className="size-5 text-foreground" strokeWidth={2} />
    </Pressable>
  );
}
