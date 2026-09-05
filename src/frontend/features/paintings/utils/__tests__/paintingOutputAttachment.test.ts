import { createPaintingOutputAttachmentDraft } from '../paintingOutputAttachment';

jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000001'),
  v7: jest.fn(() => '00000000-0000-7000-8000-000000000001'),
}));

describe('createPaintingOutputAttachmentDraft', () => {
  it('builds an image draft that references the stored file entry', () => {
    const draft = createPaintingOutputAttachmentDraft({
      fileEntryId: 'entry-1',
      uri: 'file:///files/abc.png',
    });

    expect(draft).toEqual({
      fileEntryId: 'entry-1',
      id: 'painting-file:entry-1',
      kind: 'image',
      mediaType: 'image/png',
      name: 'abc.png',
      status: 'ready',
      uri: 'file:///files/abc.png',
    });
  });

  it('falls back to a generic image media type for unknown extensions', () => {
    const draft = createPaintingOutputAttachmentDraft({
      fileEntryId: 'entry-2',
      uri: 'file:///files/abc.tiff',
    });

    expect(draft.mediaType).toBe('image/*');
    expect(draft.name).toBe('abc.tiff');
  });

  it('handles uris without an extension', () => {
    const draft = createPaintingOutputAttachmentDraft({
      fileEntryId: 'entry-3',
      uri: 'file:///files/abc',
    });

    expect(draft.mediaType).toBe('image/*');
    expect(draft.name).toBe('abc');
  });
});
