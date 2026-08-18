import { memo } from 'react';

import {
  AssistantMessage,
  type MessagePresentationItem,
  UserMessage,
} from '@/frontend/components/messagePresentation';

type ChatMessageProps = {
  message: MessagePresentationItem;
};

export const ChatMessage = memo(function ChatMessage({ message }: ChatMessageProps) {
  return message.role === 'user' ? (
    <UserMessage message={message} />
  ) : (
    <AssistantMessage message={message} />
  );
});
