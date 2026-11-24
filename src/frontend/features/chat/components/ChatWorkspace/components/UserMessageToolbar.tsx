import CheckIcon from '@cherrystudio/app-icons/icons/check';
import CopyIcon from '@cherrystudio/app-icons/icons/copy';
import PencilIcon from '@cherrystudio/app-icons/icons/pencil';
import ShareIcon from '@cherrystudio/app-icons/icons/share';
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

type UserMessageToolbarProps = {
  message: MessageListItem;
};

/**
 * Exposes copy, edit, and share directly beneath settled user messages so
 * message text keeps native selection without a competing long-press menu.
 */
export const UserMessageToolbar = memo(function UserMessageToolbar({
  message,
}: UserMessageToolbarProps) {
  const { t } = useTranslation();
  const {
    copiedMessageId,
    editableQuestionIds,
    isAssistantToolbarEnabled,
    isEditQuestionDisabled,
  } = useAssistantMessageActionsState();
  const { copyAssistantMessage, editQuestion, shareAssistantMessage } =
    useAssistantMessageActions();
  const isSettled = isAssistantToolbarEnabled && message.status !== 'pending';
  const copyText = useMemo(
    () =>
      isSettled
        ? copyAssistantMessageText(message.data.parts ?? [], message.data.citationSources)
        : '',
    [isSettled, message],
  );
  if (!isSettled) {
    return null;
  }

  const isCopied = copiedMessageId === message.id;
  const onEditQuestion =
    copyText && editQuestion && editableQuestionIds.has(message.id)
      ? () => editQuestion({ messageId: message.id })
      : undefined;

  return (
    <View className="min-h-7 flex-row items-center gap-1" testID="user-message-toolbar">
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
          testID="user-message-copy"
          variant="ghost"
        />
      ) : null}
      {onEditQuestion ? (
        <Button
          accessibilityLabel={t('chat.messageActions.editQuestionAction')}
          disabled={isEditQuestionDisabled}
          icon={<PencilIcon className="text-muted-foreground" size={15} />}
          onPress={onEditQuestion}
          size="xs"
          testID="user-message-edit"
          variant="ghost"
        />
      ) : null}
      <Button
        accessibilityLabel={t('chat.messageActions.share')}
        icon={<ShareIcon className="text-muted-foreground" size={15} />}
        onPress={() => shareAssistantMessage({ messageId: message.id })}
        size="xs"
        testID="user-message-share"
        variant="ghost"
      />
    </View>
  );
});
