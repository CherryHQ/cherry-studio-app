import { ArrowUpIcon, SquareIcon } from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import {
  useChatInputActions,
  useChatInputState,
} from '@/screens/ChatScreen/input/context/ChatInputProvider';
import { hasChatInputSendableContent } from '@/screens/ChatScreen/input/utils/chatInputAttachments';

const buttonSize = 32;

type ChatInputPrimaryActionButtonProps = {
  isSendEnabled: boolean;
  isStreaming: boolean;
  onSendPress: (text: string) => void | Promise<void>;
  onStopPress: () => void;
};

export function ChatInputPrimaryActionButton({
  isSendEnabled,
  isStreaming,
  onSendPress,
  onStopPress,
}: ChatInputPrimaryActionButtonProps) {
  const { t } = useTranslation();
  const { setInputFocused } = useChatInputActions();
  const { attachments, draft } = useChatInputState();
  const trimmedDraft = draft.trim();
  const shouldShowSend = isSendEnabled && hasChatInputSendableContent(draft, attachments);
  const Icon = isStreaming ? SquareIcon : ArrowUpIcon;
  const accessibilityLabel = isStreaming
    ? t('chat.input.action.stopGenerating')
    : t('chat.input.action.sendMessage');

  if (!isStreaming && !shouldShowSend) {
    return null;
  }

  const handlePress = async () => {
    if (isStreaming) {
      onStopPress();
      return;
    }

    if (shouldShowSend) {
      setInputFocused(false);
      await onSendPress(trimmedDraft);
    }
  };

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="absolute right-1.5 bottom-1.5 items-center justify-center rounded-full bg-primary active:opacity-70 disabled:opacity-70"
      hitSlop={6}
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
