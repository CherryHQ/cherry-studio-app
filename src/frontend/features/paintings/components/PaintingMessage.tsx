import { memo, type ComponentProps } from 'react';

import { type MessageListItem, UserMessage } from '@/frontend/components/messages';

import { PaintingAssistantMessage } from './PaintingAssistantMessage';

export type PaintingMessageState = ComponentProps<typeof PaintingAssistantMessage>;

type PaintingMessageProps = {
  message: MessageListItem;
  state: PaintingMessageState;
};

export const PaintingMessage = memo(function PaintingMessage({
  message,
  state,
}: PaintingMessageProps) {
  return message.role === 'user' ? (
    <UserMessage message={message} />
  ) : (
    <PaintingAssistantMessage {...state} />
  );
});
