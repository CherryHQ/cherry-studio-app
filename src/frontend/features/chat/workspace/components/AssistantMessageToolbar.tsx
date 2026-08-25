import CheckIcon from '@cherrystudio/app-icons/icons/check';
import CopyIcon from '@cherrystudio/app-icons/icons/copy';
import { Button } from '@cherrystudio/ui/components';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { MessageListItem } from '@/frontend/components/messages';

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
  const { copyAssistantMessage } = useAssistantMessageActions();
  const copyText = useMemo(
    () =>
      !isAssistantToolbarEnabled || message.status === 'pending'
        ? ''
        : copyAssistantMessageText(message.data.parts ?? []),
    [isAssistantToolbarEnabled, message],
  );
  const isCopied = copiedMessageId === message.id;

  if (!isAssistantToolbarEnabled || message.status === 'pending') {
    return null;
  }

  return (
    <View className="flex-row items-center gap-4" testID="assistant-message-toolbar">
      {copyText ? (
        <Button
          accessibilityLabel={t(isCopied ? 'chat.messageActions.copied' : 'common.copy')}
          className="size-4 overflow-visible p-0"
          icon={isCopied ? <CheckIcon /> : <CopyIcon />}
          onPress={() => copyAssistantMessage({ messageId: message.id, text: copyText })}
          size="sm"
          testID="assistant-message-copy"
          variant="ghost"
        />
      ) : null}
    </View>
  );
});
