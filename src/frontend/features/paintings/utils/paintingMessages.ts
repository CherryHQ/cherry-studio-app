import {
  type ComposerAttachmentDraft,
  createComposerMessageParts,
} from '@/frontend/components/composer/utils/composerAttachments';
import type { MessagePresentationItem } from '@/frontend/components/messagePresentation';

type PaintingMessageStatus = Extract<
  MessagePresentationItem['status'],
  'error' | 'pending' | 'success'
>;

export type PaintingMessageTurn = Readonly<{
  assistantMessageId: string;
  assistantStatus: PaintingMessageStatus;
  attachments: readonly ComposerAttachmentDraft[];
  prompt: string;
  userMessageId: string;
}>;

export function createPaintingMessages(turn: PaintingMessageTurn): MessagePresentationItem[] {
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
