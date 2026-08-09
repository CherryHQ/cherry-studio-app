import type { ComposerInitialAttachment } from '@/frontend/components/composer/utils/composerAttachments';

import { consumePaintingDraftHandoff, createPaintingDraftHandoff } from '../paintingDraftHandoff';

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '00000000-0000-4000-8000-000000000001'),
}));

describe('painting draft handoff', () => {
  it('returns cloned attachments once and then clears the token', () => {
    const attachments: ComposerInitialAttachment[] = [
      {
        id: 'photo:1',
        kind: 'image',
        mediaType: 'image/jpeg',
        name: 'photo.jpg',
        uri: 'file:///photo.jpg',
      },
    ];
    const token = createPaintingDraftHandoff({ attachments });
    attachments[0].uri = 'file:///changed.jpg';

    expect(consumePaintingDraftHandoff(token)?.attachments).toEqual([
      expect.objectContaining({ uri: 'file:///photo.jpg' }),
    ]);
    expect(consumePaintingDraftHandoff(token)).toBeUndefined();
  });

  it('carries the draft through the handoff', () => {
    const token = createPaintingDraftHandoff({
      attachments: [],
      draft: 'Change the aspect ratio to 1:1',
    });

    expect(consumePaintingDraftHandoff(token)).toEqual({
      attachments: [],
      draft: 'Change the aspect ratio to 1:1',
    });
  });

  it('returns undefined for missing tokens', () => {
    expect(consumePaintingDraftHandoff(undefined)).toBeUndefined();
    expect(consumePaintingDraftHandoff('unknown')).toBeUndefined();
  });
});
