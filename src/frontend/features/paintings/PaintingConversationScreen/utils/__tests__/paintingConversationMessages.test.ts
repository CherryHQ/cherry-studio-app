import type { Painting } from '@cherrystudio/universal/data/types/painting';
import { readCherryMeta } from '@cherrystudio/universal/data/types/uiParts';
import type { ResolvedPaintingFiles } from '../../../hooks/usePaintings';

import {
  createPaintingConversationMessages,
  createPendingPaintingConversationMessages,
} from '../paintingConversationMessages';

const painting: Painting = {
  createdAt: '2026-07-21T10:00:00.000Z',
  files: {
    input: ['00000000-0000-7000-8000-000000000002'],
    output: ['00000000-0000-7000-8000-000000000003'],
  },
  id: '00000000-0000-7000-8000-000000000001',
  modelId: 'provider::image-model',
  orderKey: 'a0',
  prompt: 'Draw a cherry',
  providerId: 'provider',
  updatedAt: '2026-07-21T10:01:00.000Z',
};

const files: ResolvedPaintingFiles = {
  inputs: [
    {
      fileEntryId: painting.files.input[0],
      id: `painting-file:${painting.files.input[0]}`,
      kind: 'image',
      mediaType: 'image/jpeg',
      name: 'reference.jpg',
      uri: 'file:///reference.jpg',
    },
  ],
  outputs: [
    {
      fileEntryId: painting.files.output[0],
      id: `painting-file:${painting.files.output[0]}`,
      kind: 'image',
      mediaType: 'image/png',
      name: 'painting.png',
      uri: 'file:///painting.png',
    },
  ],
};

describe('painting conversation messages', () => {
  it('projects a painting into one user and one assistant message', () => {
    const messages = createPaintingConversationMessages(painting, files);

    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual(
      expect.objectContaining({
        createdAt: painting.createdAt,
        id: painting.id,
        role: 'user',
        searchableText: painting.prompt,
        status: 'success',
      }),
    );
    expect(messages[0].data.parts?.[0]).toEqual({ text: painting.prompt, type: 'text' });
    const inputPart = messages[0].data.parts?.[1];
    if (!inputPart || inputPart.type !== 'file') {
      throw new Error('Expected the user message to contain the input file');
    }
    expect(readCherryMeta(inputPart)).toEqual({
      fileEntryId: painting.files.input[0],
    });
    expect(messages[1]).toEqual(
      expect.objectContaining({
        createdAt: painting.updatedAt,
        id: painting.files.output[0],
        modelId: painting.modelId,
        parentId: painting.id,
        role: 'assistant',
        status: 'success',
      }),
    );
    const outputPart = messages[1].data.parts?.[0];
    if (!outputPart || outputPart.type !== 'file') {
      throw new Error('Expected the assistant message to contain the output file');
    }
    expect(readCherryMeta(outputPart)).toEqual({
      fileEntryId: painting.files.output[0],
    });
  });

  it('creates a pending assistant turn for a new painting request', () => {
    const messages = createPendingPaintingConversationMessages({
      assistantMessageId: '00000000-0000-7000-8000-000000000005',
      createdAt: '2026-07-21T11:00:00.000Z',
      input: {
        attachments: files.outputs,
        mode: 'edit',
        modelId: 'provider::image-model',
        paramValues: {},
        prompt: 'Make it brighter',
      },
      userMessageId: '00000000-0000-7000-8000-000000000004',
    });

    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(messages[0].data.parts?.[0]).toEqual({ text: 'Make it brighter', type: 'text' });
    expect(messages[1]).toEqual(
      expect.objectContaining({
        data: { parts: [] },
        modelId: 'provider::image-model',
        status: 'pending',
      }),
    );
  });
});
