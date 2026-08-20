import { memo } from 'react';

import {
  AssistantMessage,
  type MessageListItem,
  UserMessage,
} from '@/frontend/components/messages';

import { AssistantMessageToolbar } from './AssistantMessageToolbar';

type ChatMessageProps = {
  message: MessageListItem;
};

function renderChatAssistantMessage(message: MessageListItem) {
  return (
    <AssistantMessage message={message}>
      <AssistantMessageToolbar message={message} />
    </AssistantMessage>
  );
}

export const ChatMessage = memo(function ChatMessage({ message }: ChatMessageProps) {
  return message.role === 'user' ? (
    <UserMessage message={message} />
  ) : (
    renderChatAssistantMessage(message)
  );
});
