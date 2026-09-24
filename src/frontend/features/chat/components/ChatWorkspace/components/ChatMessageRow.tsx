import { memo, type ReactNode } from 'react';

import type { MessageListItem } from '@/frontend/components/Message';

import {
  ConversationAttachments,
  ConversationMessageContent,
} from '../../ConversationMessageContent';
import { useChatMessageRow } from '../context/ChatMessageRowContext';
import { type AssistantMessagePresentation, ChatMessage } from './ChatMessage';

type ChatMessageRowProps = {
  assistantPresentation: AssistantMessagePresentation;
  isMessageActionsEnabled: boolean;
  isScreenReaderEnabled: boolean;
  message: MessageListItem;
  renderUsage?: (message: MessageListItem) => ReactNode;
};

/** One transcript row: its item from the list plus its own keyed conversation state. */
export const ChatMessageRow = memo(function ChatMessageRow({
  assistantPresentation,
  isMessageActionsEnabled,
  isScreenReaderEnabled,
  message,
  renderUsage,
}: ChatMessageRowProps) {
  const row = useChatMessageRow(message.id);
  return (
    <ConversationMessageContent messageState={row.messageState} tools={row.tools}>
      <ChatMessage
        assistantPresentation={assistantPresentation}
        attachments={
          row.attachments?.length ? (
            <ConversationAttachments attachments={row.attachments} />
          ) : undefined
        }
        isMessageActionsEnabled={isMessageActionsEnabled}
        isScreenReaderEnabled={isScreenReaderEnabled}
        message={message}
        renderUsage={renderUsage}
        shouldShowTimestamp={row.showsTimestamp}
      />
    </ConversationMessageContent>
  );
});
