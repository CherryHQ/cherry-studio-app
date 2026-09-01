import CheckIcon from '@cherrystudio/app-icons/icons/check';
import CopyIcon from '@cherrystudio/app-icons/icons/copy';
import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import { ActionMenu, Button, type MenuItem } from '@cherrystudio/ui/components';
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
  const { copyAssistantMessage, forkFromAssistantMessage } = useAssistantMessageActions();
  const isSettled = isAssistantToolbarEnabled && message.status !== 'pending';
  const copyText = useMemo(
    () => (isSettled ? copyAssistantMessageText(message.data.parts ?? []) : ''),
    [isSettled, message],
  );
  const isCopied = copiedMessageId === message.id;
  const menuItems = useMemo<readonly MenuItem[]>(
    () =>
      isSettled
        ? [
            {
              icon: 'branch',
              id: 'fork',
              label: t('chat.messageActions.fork'),
              onPress: () => forkFromAssistantMessage({ messageId: message.id }),
            },
          ]
        : [],
    [forkFromAssistantMessage, isSettled, message.id, t],
  );

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
      {/*
        The native menu installs its own hit target over this subtree, so the
        trigger is a plain labelled View rather than a second pressable.
      */}
      <ActionMenu items={menuItems}>
        <View
          accessibilityLabel={t('common.more')}
          accessibilityRole="button"
          className="size-7 items-center justify-center"
          testID="assistant-message-more"
        >
          <EllipsisIcon className="size-4 text-muted-foreground" />
        </View>
      </ActionMenu>
    </View>
  );
});
