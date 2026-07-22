import type { CherryMessagePart, Message } from '@/data/types/message';
import type { Painting } from '@/data/types/painting';
import type { ResolvedPaintingFiles } from '@/hooks/paintings';
import { createChatInputMessageParts } from '@/screens/ChatScreen/input/utils/chatInputAttachments';
import type { PaintingGenerationInput } from '../../hooks/usePaintingGeneration';

type PendingPaintingTurn = {
  assistantMessageId: string;
  createdAt: string;
  input: PaintingGenerationInput;
  userMessageId: string;
};

export function createPaintingConversationMessages(
  painting: Painting,
  files: ResolvedPaintingFiles,
): Message[] {
  const assistantMessageId = painting.files.output[0];
  if (!assistantMessageId) {
    throw new Error('Painting conversation requires an output file');
  }

  return [
    createMessage({
      createdAt: painting.createdAt,
      id: painting.id,
      modelId: null,
      parentId: null,
      parts: createChatInputMessageParts(painting.prompt, files.inputs),
      role: 'user',
      searchableText: painting.prompt,
      status: 'success',
      topicId: painting.id,
      updatedAt: painting.updatedAt,
    }),
    createMessage({
      createdAt: painting.updatedAt,
      id: assistantMessageId,
      modelId: painting.modelId,
      parentId: painting.id,
      parts: createChatInputMessageParts('', files.outputs),
      role: 'assistant',
      searchableText: '',
      status: 'success',
      topicId: painting.id,
      updatedAt: painting.updatedAt,
    }),
  ];
}

export function createPendingPaintingConversationMessages(turn: PendingPaintingTurn): Message[] {
  return [
    createMessage({
      createdAt: turn.createdAt,
      id: turn.userMessageId,
      modelId: null,
      parentId: null,
      parts: createChatInputMessageParts(turn.input.prompt, turn.input.attachments),
      role: 'user',
      searchableText: turn.input.prompt,
      status: 'success',
      topicId: turn.userMessageId,
      updatedAt: turn.createdAt,
    }),
    createMessage({
      createdAt: turn.createdAt,
      id: turn.assistantMessageId,
      modelId: turn.input.modelId,
      parentId: turn.userMessageId,
      parts: [],
      role: 'assistant',
      searchableText: '',
      status: 'pending',
      topicId: turn.userMessageId,
      updatedAt: turn.createdAt,
    }),
  ];
}

function createMessage(input: {
  createdAt: string;
  id: string;
  modelId: string | null;
  parentId: string | null;
  parts: CherryMessagePart[];
  role: 'assistant' | 'user';
  searchableText: string;
  status: 'pending' | 'success';
  topicId: string;
  updatedAt: string;
}): Message {
  return {
    createdAt: input.createdAt,
    data: { parts: input.parts },
    id: input.id,
    modelId: input.modelId,
    parentId: input.parentId,
    role: input.role,
    searchableText: input.searchableText,
    siblingsGroupId: 0,
    status: input.status,
    topicId: input.topicId,
    updatedAt: input.updatedAt,
  };
}
