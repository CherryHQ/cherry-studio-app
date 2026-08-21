import { readCherryMeta } from '@/shared/data/types/uiParts';

import type { ResolvedPaintingAttachment } from '../../hooks/usePaintings';
import { createPaintingMessages } from '../paintingMessages';

const input: ResolvedPaintingAttachment = {
  fileEntryId: '00000000-0000-7000-8000-000000000002',
  id: 'painting-file:input',
  kind: 'image',
  mediaType: 'image/jpeg',
  name: 'reference.jpg',
  status: 'ready',
  uri: 'file:///reference.jpg',
};
describe('painting messages', () => {
  it('projects one generation into user and assistant list messages', () => {
    const messages = createPaintingMessages({
      assistantMessageId: 'assistant-1',
      assistantStatus: 'success',
      attachments: [input],
      prompt: 'Draw a cherry',
      userMessageId: 'user-1',
    });

    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(messages[0]).toMatchObject({ id: 'user-1', status: 'success' });
    expect(messages[0].data.parts?.[0]).toEqual({ text: 'Draw a cherry', type: 'text' });
    const inputPart = messages[0].data.parts?.[1];
    expect(inputPart?.type).toBe('file');
    if (inputPart?.type === 'file') {
      expect(readCherryMeta(inputPart)).toEqual({ fileEntryId: input.fileEntryId });
    }
    expect(messages[1]).toMatchObject({
      data: { parts: [] },
      id: 'assistant-1',
      status: 'success',
    });
  });

  it('creates an empty pending assistant message for the loader renderer', () => {
    const messages = createPaintingMessages({
      assistantMessageId: 'assistant-1',
      assistantStatus: 'pending',
      attachments: [],
      prompt: 'Draw a cherry',
      userMessageId: 'user-1',
    });

    expect(messages[1]).toMatchObject({ data: { parts: [] }, status: 'pending' });
  });
});
