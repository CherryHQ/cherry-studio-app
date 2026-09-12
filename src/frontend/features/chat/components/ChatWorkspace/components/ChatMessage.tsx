import { memo } from 'react';
import { Text, View } from 'react-native';

import { AgentAvatar, ModelAvatar } from '@/frontend/components/Avatar';
import { AssistantMessage, type MessageListItem, UserMessage } from '@/frontend/components/Message';

import { AssistantMessageToolbar } from './AssistantMessageToolbar';
import { AssistantMessageUsage } from './AssistantMessageUsage';

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
          <View className="w-full flex-row flex-wrap items-center gap-x-3 gap-y-1">
            <AssistantMessageToolbar message={message} />
            <View className="min-w-0 max-w-full flex-1 items-end">
              <AssistantMessageUsage message={message} />
            </View>
          </View>
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
      {message.role === 'user' ? (
        <UserMessage message={message} />
      ) : (
        renderChatAssistantMessage(isTextSelectionEnabled, message, assistantPresentation)
      )}
    </View>
  );
});
