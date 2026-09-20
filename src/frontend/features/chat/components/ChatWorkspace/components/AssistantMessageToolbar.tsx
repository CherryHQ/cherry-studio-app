import CheckIcon from '@cherrystudio/app-icons/icons/check';
import CopyIcon from '@cherrystudio/app-icons/icons/copy';
import RotateCcwIcon from '@cherrystudio/app-icons/icons/rotate-ccw';
import ShareIcon from '@cherrystudio/app-icons/icons/share';
import SplitIcon from '@cherrystudio/app-icons/icons/split';
import { Button } from '@cherrystudio/ui/components';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { MessageListItem } from '@/frontend/components/Message';

import {
  useAssistantMessageActions,
  useAssistantMessageActionsState,
} from '../context/AssistantMessageActionsProvider';
import { copyAssistantMessageText } from '../utils/copyAssistantMessageText';

type AssistantMessageToolbarProps = {
  message: MessageListItem;
};

export const AssistantMessageToolbar = memo(function AssistantMessageToolbar({
  message,
}: AssistantMessageToolbarProps) {
  const { t } = useTranslation();
  const { copiedMessageId, isAssistantToolbarEnabled, isRetryDisabled, retryableMessageId } =
    useAssistantMessageActionsState();
  const {
    copyAssistantMessage,
    forkFromAssistantMessage,
    retryAssistantMessage,
    shareAssistantMessage,
  } = useAssistantMessageActions();
  const isSettled = isAssistantToolbarEnabled && message.status !== 'pending';
  const copyText = useMemo(
    () => (isSettled ? copyAssistantMessageText(message.data.parts ?? []) : ''),
    [isSettled, message],
  );
  const isCopied = copiedMessageId === message.id;

  if (!isSettled) {
    return null;
  }

  return (
    <View className="min-h-7 flex-row items-center gap-1" testID="assistant-message-toolbar">
      {retryableMessageId === message.id ? (
        <Button
          accessibilityLabel={t(
            message.status === 'success' ? 'chat.messageActions.regenerate' : 'common.retry',
          )}
          disabled={isRetryDisabled}
          icon={<RotateCcwIcon className="text-muted-foreground" size={15} />}
          onPress={() => retryAssistantMessage({ messageId: message.id })}
          size="xs"
          testID="assistant-message-retry"
          variant="ghost"
        />
      ) : null}
      {copyText ? (
        <Button
          accessibilityLabel={t(isCopied ? 'chat.messageActions.copied' : 'common.copy')}
          icon={
            isCopied ? (
              <CheckIcon className="text-success" size={15} />
            ) : (
              <CopyIcon className="text-muted-foreground" size={15} />
            )
          }
          onPress={() => copyAssistantMessage({ messageId: message.id, text: copyText })}
          size="xs"
          testID="assistant-message-copy"
          variant="ghost"
        />
      ) : null}
      <Button
        accessibilityLabel={t('chat.messageActions.fork')}
        icon={<SplitIcon className="text-muted-foreground" size={15} />}
        onPress={() => forkFromAssistantMessage({ messageId: message.id })}
        size="xs"
        testID="assistant-message-fork"
        variant="ghost"
      />
      <Button
        accessibilityLabel={t('chat.share.title')}
        icon={<ShareIcon className="text-muted-foreground" size={15} />}
        onPress={() => shareAssistantMessage({ messageId: message.id })}
        size="xs"
        testID="assistant-message-share"
        variant="ghost"
      />
    </View>
  );
});
