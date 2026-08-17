import { CheckIcon, CopyIcon, RefreshCwIcon } from '@cherrystudio/app-icons';
import { Button } from '@cherrystudio/ui/components';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { MessagePresentationItem } from '@/frontend/components/messagePresentation';

import {
  useAssistantMessageActionCommands,
  useAssistantMessageActionState,
} from '../context/AssistantMessageActionsProvider';
import { copyAssistantMessageText } from '../utils/copyAssistantMessageText';

type AssistantMessageToolbarProps = {
  message: MessagePresentationItem;
};

export const AssistantMessageToolbar = memo(function AssistantMessageToolbar({
  message,
}: AssistantMessageToolbarProps) {
  const { t } = useTranslation();
  const { copiedMessageId, isRegenerateDisabled } = useAssistantMessageActionState();
  const { copyAssistantMessage, regenerateAssistantMessage } = useAssistantMessageActionCommands();
  const copyText = useMemo(() => copyAssistantMessageText(message.data.parts ?? []), [message]);
  const isCopied = copiedMessageId === message.id;

  if (message.status === 'pending') {
    return null;
  }

  return (
    <View className="-ml-3.5 flex-row items-center" testID="assistant-message-toolbar">
      {copyText ? (
        <Button
          accessibilityLabel={t(isCopied ? 'chat.messageActions.copied' : 'common.copy')}
          className="size-11 p-0"
          icon={isCopied ? <CheckIcon /> : <CopyIcon />}
          onPress={() => copyAssistantMessage({ messageId: message.id, text: copyText })}
          size="sm"
          testID="assistant-message-copy"
          variant="ghost"
        />
      ) : null}
      <Button
        accessibilityLabel={t('chat.messageActions.regenerate')}
        className="size-11 p-0"
        disabled={isRegenerateDisabled}
        icon={<RefreshCwIcon />}
        onPress={() => regenerateAssistantMessage(message.id)}
        size="sm"
        testID="assistant-message-regenerate"
        variant="ghost"
      />
    </View>
  );
});
