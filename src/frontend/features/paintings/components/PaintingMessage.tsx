import { memo, type ComponentProps } from 'react';

import {
  type MessagePresentationItem,
  UserMessage,
} from '@/frontend/components/messagePresentation';

import { PaintingAssistantMessage } from './PaintingAssistantMessage';

export type PaintingMessageState = ComponentProps<typeof PaintingAssistantMessage>;

type PaintingMessageProps = {
  message: MessagePresentationItem;
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
