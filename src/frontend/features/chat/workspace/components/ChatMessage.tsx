import { memo } from 'react';

import {
  AssistantMessage,
  type MessageListItem,
  UserMessage,
} from '@/frontend/components/messages';

type ChatMessageProps = {
  message: MessageListItem;
};

export const ChatMessage = memo(function ChatMessage({ message }: ChatMessageProps) {
  return message.role === 'user' ? (
    <UserMessage message={message} />
  ) : (
    <AssistantMessage message={message} />
  );
});
