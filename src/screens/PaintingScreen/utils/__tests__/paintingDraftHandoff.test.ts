import type { ChatInputAttachmentDraft } from '@/screens/ChatScreen/input/utils/chatInputAttachments';

import { consumePaintingDraftHandoff, createPaintingDraftHandoff } from '../paintingDraftHandoff';

jest.mock('uuid', () => ({
  v7: jest.fn(() => '00000000-0000-7000-8000-000000000001'),
}));

describe('painting draft handoff', () => {
  it('returns cloned attachments once and then clears the token', () => {
    const attachments: ChatInputAttachmentDraft[] = [
      {
        id: 'photo:1',
        kind: 'image',
        mediaType: 'image/jpeg',
        name: 'photo.jpg',
        uri: 'file:///photo.jpg',
      },
    ];
    const token = createPaintingDraftHandoff(attachments);
    attachments[0].uri = 'file:///changed.jpg';

    expect(consumePaintingDraftHandoff(token)).toEqual([
      expect.objectContaining({ uri: 'file:///photo.jpg' }),
    ]);
    expect(consumePaintingDraftHandoff(token)).toEqual([]);
  });
});
