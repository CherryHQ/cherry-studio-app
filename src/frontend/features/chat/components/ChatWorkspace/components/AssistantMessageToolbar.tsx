import AtSignIcon from '@cherrystudio/app-icons/icons/at-sign';
import CheckIcon from '@cherrystudio/app-icons/icons/check';
import CopyIcon from '@cherrystudio/app-icons/icons/copy';
import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import RotateCcwIcon from '@cherrystudio/app-icons/icons/rotate-ccw';
import SplitIcon from '@cherrystudio/app-icons/icons/split';
import {
  ActionMenu,
  Button,
  OptionPickerBottomSheet,
  type MenuItem,
} from '@cherrystudio/ui/components';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, View } from 'react-native';

import type { MessageListItem } from '@/frontend/components/Message';
import { APP_LANGUAGES, type AppLanguage } from '@/shared/utils/languages';

import {
  useAssistantMessageActions,
  useAssistantMessageActionsState,
} from '../context/AssistantMessageActionsProvider';
import { useMessageTranslation } from '../translation/MessageTranslationProvider';
import { copyAssistantMessageText } from '../utils/copyAssistantMessageText';

type AssistantMessageToolbarProps = {
  message: MessageListItem;
};

/**
 * Frequent actions stay one tap away; translation, sharing and deletion share
 * one short menu.
 */
export const AssistantMessageToolbar = memo(function AssistantMessageToolbar({
  message,
}: AssistantMessageToolbarProps) {
  const { t } = useTranslation();
  const [isTranslationLanguagePickerOpen, setIsTranslationLanguagePickerOpen] = useState(false);
  const {
    copiedMessageId,
    isAssistantToolbarEnabled,
    isDeleteDisabled,
    isRetryDisabled,
    retryableMessageIds,
    editableMessageIds,
    isEditDisabled,
  } = useAssistantMessageActionsState();
  const {
    answerWithModel,
    editAssistantMessage,
    copyAssistantMessage,
    deleteMessageTurn,
    forkFromAssistantMessage,
    retryAssistantMessage,
    shareAssistantMessage,
  } = useAssistantMessageActions();
  const translation = useMessageTranslation(message);
  const isSettled = isAssistantToolbarEnabled && message.status !== 'pending';
  const copyText = useMemo(
    () => (isSettled ? copyAssistantMessageText(message.data.parts ?? []) : ''),
    [isSettled, message],
  );
  const isCopied = copiedMessageId === message.id;
  // Turn-scoped, so a row with no turn — synthetic, or not yet reserved — has
  // nothing to delete.
  const turnId = message.turnId;
  // Answering with another model is offered wherever the answer can be regenerated.
  const isRegenerable = retryableMessageIds.has(message.id);

  if (!isSettled) {
    return null;
  }

  const hasTranslation = translation ? translation.state.status !== 'idle' : false;
  const menuItems: MenuItem[] = [
    ...(editAssistantMessage && editableMessageIds.has(message.id)
      ? [
          {
            id: 'edit',
            label: t('chat.messageActions.edit'),
            disabled: isEditDisabled,
            onPress: () => editAssistantMessage({ messageId: message.id }),
          },
        ]
      : []),
    ...(translation
      ? [
          {
            id: 'translate',
            label: t(
              hasTranslation
                ? translation.state.visible
                  ? 'chat.translation.hide'
                  : 'chat.translation.show'
                : 'chat.translation.translate',
            ),
            onPress: () => {
              if (hasTranslation) {
                translation.store.toggle(translation.source);
              } else {
                Keyboard.dismiss();
                setIsTranslationLanguagePickerOpen(true);
              }
            },
          },
        ]
      : []),
    {
      id: 'share',
      label: t('chat.messageActions.share'),
      onPress: () => shareAssistantMessage({ messageId: message.id }),
    },
    ...(deleteMessageTurn && turnId
      ? [
          {
            destructive: true,
            disabled: isDeleteDisabled,
            id: 'delete',
            label: t('common.delete'),
            onPress: () => deleteMessageTurn({ turnId }),
          },
        ]
      : []),
  ];

  return (
    <View className="min-h-7 flex-row items-center gap-1" testID="assistant-message-toolbar">
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
      {retryAssistantMessage && isRegenerable ? (
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
      {answerWithModel && isRegenerable ? (
        <Button
          accessibilityLabel={t('chat.messageActions.answerWith')}
          disabled={isRetryDisabled}
          icon={<AtSignIcon className="text-muted-foreground" size={15} />}
          onPress={() => answerWithModel({ messageId: message.id })}
          size="xs"
          testID="assistant-message-answer-with"
          variant="ghost"
        />
      ) : null}
      {forkFromAssistantMessage ? (
        <Button
          accessibilityLabel={t('chat.messageActions.fork')}
          icon={<SplitIcon className="text-muted-foreground" size={15} />}
          onPress={() => forkFromAssistantMessage({ messageId: message.id })}
          size="xs"
          testID="assistant-message-fork"
          variant="ghost"
        />
      ) : null}
      <ActionMenu items={menuItems}>
        <Button
          accessibilityLabel={t('common.more')}
          icon={<EllipsisIcon className="text-muted-foreground" size={15} />}
          size="xs"
          testID="assistant-message-more"
          variant="ghost"
        />
      </ActionMenu>
      {translation && isTranslationLanguagePickerOpen ? (
        <OptionPickerBottomSheet<AppLanguage | ''>
          onClose={() => setIsTranslationLanguagePickerOpen(false)}
          onValueChange={(language) => {
            if (language) void translation.store.start(translation.source, language);
          }}
          open
          options={APP_LANGUAGES}
          selectedValue=""
          size="large"
          testID="message-translation-language-picker"
          title={t('chat.translation.translate')}
        />
      ) : null}
    </View>
  );
});
