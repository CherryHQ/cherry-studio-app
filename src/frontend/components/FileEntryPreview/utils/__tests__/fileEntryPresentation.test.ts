import { fileEntryPreviewKind } from '../fileEntryPresentation';

describe('fileEntryPreviewKind', () => {
  it.each([
    ['image/png', 'image'],
    ['image/svg+xml', 'image'],
    ['application/pdf', 'pdf'],
    ['application/msword', 'document'],
    ['application/vnd.ms-excel', 'document'],
    ['application/vnd.ms-powerpoint', 'document'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'office'],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'office'],
    ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'office'],
    ['application/vnd.oasis.opendocument.text', 'document'],
    ['text/rtf', 'document'],
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
    expect(fileEntryPreviewKind({ mediaType: 'APPLICATION/PDF' })).toBe('pdf');
  });
});
