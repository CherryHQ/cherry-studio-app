import { fileEntryPreviewKind } from '../fileEntryPresentation';

describe('fileEntryPreviewKind', () => {
  it.each([
    ['image/png', 'image'],
    ['application/pdf', 'pdf'],
    ['text/markdown', 'text'],
    ['application/zip', 'document'],
  ])('classifies %s as %s', (mediaType, kind) => {
    expect(fileEntryPreviewKind({ mediaType })).toBe(kind);
  });

  it.each(['audio/mpeg', 'video/quicktime'])(
    'leaves %s a document until something previews it',
    (mediaType) => {
      expect(fileEntryPreviewKind({ mediaType })).toBe('document');
    },
  );

  it('ignores media type parameters and casing', () => {
    expect(fileEntryPreviewKind({ mediaType: 'Text/Plain; charset=utf-8' })).toBe('text');
    expect(fileEntryPreviewKind({ mediaType: 'APPLICATION/PDF' })).toBe('pdf');
  });
});
