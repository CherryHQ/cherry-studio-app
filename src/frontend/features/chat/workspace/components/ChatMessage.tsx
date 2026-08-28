import { Menu, type MenuItem } from '@cherrystudio/ui/components';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { AgentAvatar } from '@/frontend/components/avatar';
import {
  AssistantMessage,
  type MessageListItem,
  UserMessage,
} from '@/frontend/components/messages';

import {
  useAssistantMessageActions,
  useAssistantMessageActionsState,
} from '../context/AssistantMessageActionsProvider';
import { copyAssistantMessageText } from '../utils/copyAssistantMessageText';
import { AssistantMessageToolbar } from './AssistantMessageToolbar';

export type AssistantMessagePresentation = Readonly<{
  avatarUri?: null | string;
  modelName?: null | string;
  name: string;
}>;

type ChatMessageProps = {
  assistantPresentation: AssistantMessagePresentation;
  message: MessageListItem;
};

function renderChatAssistantMessage(
  message: MessageListItem,
  presentation: AssistantMessagePresentation,
) {
  return (
    <View className="w-full gap-2.5">
      <View className="w-full flex-row items-center gap-2">
        <AgentAvatar
          accessibilityLabel={presentation.name}
          name={presentation.name}
          size={24}
          uri={presentation.avatarUri}
        />
        <View className="min-w-0 flex-1 flex-row items-baseline gap-1.5">
          <Text className="shrink font-semibold text-foreground text-sm" numberOfLines={1}>
            {presentation.name}
          </Text>
          {presentation.modelName ? (
            <Text className="min-w-0 flex-1 text-muted-foreground text-sm" numberOfLines={1}>
              {presentation.modelName}
            </Text>
          ) : null}
        </View>
      </View>
      <AssistantMessage message={message}>
        <AssistantMessageToolbar message={message} />
      </AssistantMessage>
    </View>
  );
}

export const ChatMessage = memo(function ChatMessage({
  assistantPresentation,
  message,
}: ChatMessageProps) {
  const { t } = useTranslation();
  const { isAssistantToolbarEnabled } = useAssistantMessageActionsState();
  const { copyAssistantMessage } = useAssistantMessageActions();
  const copyText = useMemo(
    () =>
      !isAssistantToolbarEnabled || message.status === 'pending'
        ? ''
        : copyAssistantMessageText(message.data.parts ?? []),
    [isAssistantToolbarEnabled, message],
  );
  const menuItems = useMemo<readonly MenuItem[]>(
    () =>
      copyText
        ? [
            {
              id: 'copy',
              label: t('common.copy'),
              onPress: () => copyAssistantMessage({ messageId: message.id, text: copyText }),
            },
          ]
        : [],
    [copyAssistantMessage, copyText, message.id, t],
  );

  return (
    <Menu items={menuItems} trigger="longPress">
      <View className="w-full" collapsable={false}>
        {message.role === 'user' ? (
          <UserMessage message={message} />
        ) : (
          renderChatAssistantMessage(message, assistantPresentation)
        )}
      </View>
    </Menu>
  );
});
