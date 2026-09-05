import { fileEntryPreviewKind } from '../fileEntryPresentation';

describe('fileEntryPreviewKind', () => {
  it.each([
    ['image/png', 'image'],
    ['application/pdf', 'document'],
    ['text/markdown', 'markdown'],
    ['application/zip', 'document'],
    ['text/html', 'html'],
    ['text/plain', 'text'],
    ['text/tab-separated-values', 'text'],
    ['application/json', 'text'],
    ['application/xml', 'text'],
    ['application/yaml', 'text'],
    ['application/x-yaml', 'text'],
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
    expect(fileEntryPreviewKind({ mediaType: 'APPLICATION/PDF' })).toBe('document');
  });
});
