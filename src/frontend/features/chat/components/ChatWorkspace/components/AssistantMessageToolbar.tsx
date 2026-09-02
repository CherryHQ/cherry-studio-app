import CheckIcon from '@cherrystudio/app-icons/icons/check';
import CopyIcon from '@cherrystudio/app-icons/icons/copy';
import GitForkIcon from '@cherrystudio/app-icons/icons/git-fork';
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
  const { copiedMessageId, isAssistantToolbarEnabled } = useAssistantMessageActionsState();
  const { copyAssistantMessage, forkFromAssistantMessage } = useAssistantMessageActions();
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
      {copyText ? (
        <Button
          accessibilityLabel={t(isCopied ? 'chat.messageActions.copied' : 'common.copy')}
          icon={
            isCopied ? (
              <CheckIcon className="text-muted-foreground" />
            ) : (
              <CopyIcon className="text-muted-foreground" />
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
        icon={<GitForkIcon className="text-muted-foreground" />}
        onPress={() => forkFromAssistantMessage({ messageId: message.id })}
        size="xs"
        testID="assistant-message-fork"
        variant="ghost"
      />
    </View>
  );
});
