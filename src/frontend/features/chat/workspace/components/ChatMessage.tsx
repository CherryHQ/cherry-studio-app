import { ContextMenu, type MenuItem } from '@cherrystudio/ui/components';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { AgentAvatar, ModelAvatar } from '@/frontend/components/avatar';
import {
  AssistantMessage,
  type MessageListItem,
  UserMessage,
} from '@/frontend/components/messages';

import { useAssistantMessageActions } from '../context/AssistantMessageActionsProvider';
import { copyAssistantMessageText } from '../utils/copyAssistantMessageText';
import { AssistantMessageToolbar } from './AssistantMessageToolbar';

export type AssistantMessagePresentation = Readonly<{
  avatarUri?: null | string;
  name: string;
}>;

type ChatMessageProps = {
  assistantPresentation: AssistantMessagePresentation;
  isMessageActionsEnabled: boolean;
  message: MessageListItem;
};

function renderChatAssistantMessage(
  isTextSelectionEnabled: boolean,
  message: MessageListItem,
  presentation: AssistantMessagePresentation,
) {
  const createdAt = formatMessageCreatedAt(message.createdAt);

  return (
    <View className="w-full gap-2.5">
      <View className="w-full flex-row items-center gap-2">
        <AgentAvatar
          accessibilityLabel={presentation.name}
          name={presentation.name}
          size={24}
          uri={presentation.avatarUri}
        />
        <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
          <Text className="shrink font-semibold text-foreground text-sm" numberOfLines={1}>
            {presentation.name}
          </Text>
          {message.model ? (
            <View className="min-w-0 shrink flex-row items-center gap-1">
              <ModelAvatar model={message.model} size={16} />
              <Text className="min-w-0 shrink text-muted-foreground text-sm" numberOfLines={1}>
                {message.model.name}
              </Text>
            </View>
          ) : null}
          {createdAt ? (
            <Text
              className="shrink-0 text-foreground-tertiary text-xs tabular-nums"
              numberOfLines={1}
              testID="assistant-message-time"
            >
              {createdAt}
            </Text>
          ) : null}
        </View>
      </View>
      <AssistantMessage isTextSelectionEnabled={isTextSelectionEnabled} message={message}>
        <AssistantMessageToolbar message={message} />
      </AssistantMessage>
    </View>
  );
}

function formatMessageCreatedAt(createdAt: string | undefined): string | undefined {
  if (!createdAt) {
    return undefined;
  }

  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${month}/${day} ${hour}:${minute}`;
}

export const ChatMessage = memo(function ChatMessage({
  assistantPresentation,
  isMessageActionsEnabled,
  message,
}: ChatMessageProps) {
  const { t } = useTranslation();
  const { copyAssistantMessage } = useAssistantMessageActions();
  const isTextSelectionEnabled = !isMessageActionsEnabled;
  const copyText = useMemo(
    () =>
      !isMessageActionsEnabled || message.status === 'pending'
        ? ''
        : copyAssistantMessageText(message.data.parts ?? []),
    [isMessageActionsEnabled, message],
  );
  const menuItems = useMemo<readonly MenuItem[]>(() => {
    if (!isMessageActionsEnabled) {
      return [];
    }

    return [
      {
        disabled: !copyText,
        id: 'copy',
        label: t('common.copy'),
        onPress: () => copyAssistantMessage({ messageId: message.id, text: copyText }),
      },
    ];
  }, [copyAssistantMessage, copyText, isMessageActionsEnabled, message.id, t]);

  return (
    <ContextMenu items={menuItems}>
      <View className="w-full" collapsable={false}>
        {message.role === 'user' ? (
          <UserMessage message={message} />
        ) : (
          renderChatAssistantMessage(isTextSelectionEnabled, message, assistantPresentation)
        )}
      </View>
    </ContextMenu>
  );
});
