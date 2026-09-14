import { ContextMenu, ContextMenuExclusion, type MenuItem } from '@cherrystudio/ui/components';
import { memo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { AgentAvatar, ModelAvatar } from '@/frontend/components/Avatar';
import { AssistantMessage, type MessageListItem, UserMessage } from '@/frontend/components/Message';

import { useAssistantMessageActions } from '../context/AssistantMessageActionsProvider';
import { copyAssistantMessageText } from '../utils/copyAssistantMessageText';
import { AssistantMessageToolbar } from './AssistantMessageToolbar';
import { AssistantMessageUsage } from './AssistantMessageUsage';

const MESSAGE_CONTEXT_MENU_DELAY_MS = 1_500;

export type AssistantMessagePresentation = Readonly<{
  avatar?: null | string;
  avatarUri?: null | string;
  name: string;
}>;

type ChatMessageProps = {
  assistantPresentation: AssistantMessagePresentation;
  isMessageActionsEnabled: boolean;
  message: MessageListItem;
  shouldShowTimestamp: boolean;
};

function renderChatAssistantMessage(
  isTextSelectionEnabled: boolean,
  message: MessageListItem,
  presentation: AssistantMessagePresentation,
) {
  return (
    <View className="w-full gap-2.5">
      <View className="w-full flex-row items-center gap-2">
        <AgentAvatar
          accessibilityLabel={presentation.name}
          avatar={presentation.avatar}
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
              <Text className="min-w-0 shrink text-foreground-tertiary text-sm" numberOfLines={1}>
                {message.model.name}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <AssistantMessage isTextSelectionEnabled={isTextSelectionEnabled} message={message}>
        {message.status !== 'pending' ? (
          <ContextMenuExclusion className="w-full flex-row flex-wrap items-center gap-x-3 gap-y-1">
            <AssistantMessageToolbar message={message} />
            <View className="min-w-0 max-w-full flex-1 items-end">
              <AssistantMessageUsage message={message} />
            </View>
          </ContextMenuExclusion>
        ) : null}
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
  shouldShowTimestamp,
}: ChatMessageProps) {
  const isTextSelectionEnabled = !isMessageActionsEnabled;
  const createdAt = shouldShowTimestamp ? formatMessageCreatedAt(message.createdAt) : undefined;
  const content =
    message.role === 'user' ? (
      <UserMessage message={message} />
    ) : (
      renderChatAssistantMessage(isTextSelectionEnabled, message, assistantPresentation)
    );

  return (
    <View className="w-full gap-3" testID={`chat-message-${message.id}`}>
      {createdAt ? (
        <Text
          className="text-center font-mono text-muted-foreground text-xs"
          testID="chat-message-time"
        >
          {createdAt}
        </Text>
      ) : null}
      {isMessageActionsEnabled ? (
        <ChatMessageContextMenu message={message}>{content}</ChatMessageContextMenu>
      ) : (
        content
      )}
    </View>
  );
});

function ChatMessageContextMenu({
  children,
  message,
}: {
  children: ReactElement;
  message: MessageListItem;
}) {
  const { t } = useTranslation();
  const { copyAssistantMessage, shareAssistantMessage } = useAssistantMessageActions();
  // These existing actions and the text projection accept either message role.
  const text =
    message.status === 'pending' ? '' : copyAssistantMessageText(message.data.parts ?? []);
  const items: readonly MenuItem[] =
    message.status === 'pending'
      ? []
      : [
          {
            disabled: !text,
            id: 'copy',
            label: t('common.copy'),
            onPress: () => copyAssistantMessage({ messageId: message.id, text }),
          },
          {
            id: 'share',
            label: t('chat.share.title'),
            onPress: () => shareAssistantMessage({ messageId: message.id }),
          },
        ];

  return (
    <ContextMenu delayLongPress={MESSAGE_CONTEXT_MENU_DELAY_MS} items={items}>
      <View className="w-full">{children}</View>
    </ContextMenu>
  );
}
