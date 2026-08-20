import {
  type ComposerAttachmentDraft,
  createComposerMessageParts,
} from '@/frontend/components/composer/utils/composerAttachments';
import type { MessageListItem } from '@/frontend/components/messages';

type PaintingMessageStatus = Extract<MessageListItem['status'], 'error' | 'pending' | 'success'>;

export type PaintingMessageTurn = Readonly<{
  assistantMessageId: string;
  assistantStatus: PaintingMessageStatus;
  attachments: readonly ComposerAttachmentDraft[];
  prompt: string;
  userMessageId: string;
}>;

export function createPaintingMessages(turn: PaintingMessageTurn): MessageListItem[] {
  return [
    {
      data: { parts: createComposerMessageParts(turn.prompt, turn.attachments) },
      id: turn.userMessageId,
      role: 'user',
      status: 'success',
    },
    {
      data: { parts: [] },
      id: turn.assistantMessageId,
      role: 'assistant',
      status: turn.assistantStatus,
    },
  ];
}
