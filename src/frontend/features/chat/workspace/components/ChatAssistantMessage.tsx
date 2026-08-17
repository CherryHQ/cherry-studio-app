import {
  AssistantMessage,
  type MessagePresentationItem,
} from '@/frontend/components/messagePresentation';

import { AssistantMessageToolbar } from './AssistantMessageToolbar';

type ChatAssistantMessageProps = {
  message: MessagePresentationItem;
};

export function ChatAssistantMessage({ message }: ChatAssistantMessageProps) {
  return (
    <AssistantMessage message={message}>
      <AssistantMessageToolbar message={message} />
    </AssistantMessage>
  );
}
