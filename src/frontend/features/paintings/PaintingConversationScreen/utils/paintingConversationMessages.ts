import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';
import type { Painting } from '@cherrystudio/universal/data/types/painting';

import { createComposerMessageParts } from '@/frontend/components/composer/utils/composerAttachments';
import type { MessagePresentationItem } from '@/frontend/components/messagePresentation';

import type { PaintingGenerationInput } from '../../hooks/usePaintingGeneration';
import type { ResolvedPaintingFiles } from '../../hooks/usePaintings';

type PendingPaintingTurn = {
  assistantMessageId: string;
  input: PaintingGenerationInput;
  userMessageId: string;
};

export function createPaintingConversationMessages(
  painting: Painting,
  files: ResolvedPaintingFiles,
): MessagePresentationItem[] {
  const assistantMessageId = painting.files.output[0];
  if (!assistantMessageId) {
    throw new Error('Painting conversation requires an output file');
  }

  return [
    createMessage({
      id: painting.id,
      parts: createComposerMessageParts(painting.prompt, files.inputs),
      role: 'user',
      status: 'success',
    }),
    createMessage({
      id: assistantMessageId,
      parts: createComposerMessageParts('', files.outputs),
      role: 'assistant',
      status: 'success',
    }),
  ];
}

export function createPendingPaintingConversationMessages(
  turn: PendingPaintingTurn,
): MessagePresentationItem[] {
  return [
    createMessage({
      id: turn.userMessageId,
      parts: createComposerMessageParts(turn.input.prompt, turn.input.attachments),
      role: 'user',
      status: 'success',
    }),
    createMessage({
      id: turn.assistantMessageId,
      parts: [],
      role: 'assistant',
      status: 'pending',
    }),
  ];
}

function createMessage(input: {
  id: string;
  parts: CherryMessagePart[];
  role: 'assistant' | 'user';
  status: 'pending' | 'success';
}): MessagePresentationItem {
  return {
    data: { parts: input.parts },
    id: input.id,
    role: input.role,
    status: input.status,
  };
}
