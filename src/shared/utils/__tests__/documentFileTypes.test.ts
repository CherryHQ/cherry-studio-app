import {
  documentFileTypeFromMediaType,
  resolveDocumentImportMediaType,
} from '../documentFileTypes';

describe('document file types', () => {
  test.each([
    ['brief.PDF', 'application/pdf', 'pdf'],
    [
      'brief.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'docx',
    ],
    [
      'slides.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'pptx',
    ],
    ['data.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
  ])('fills missing picker metadata for %s before persistence', (name, mediaType, type) => {
    expect(resolveDocumentImportMediaType(name)).toBe(mediaType);
    expect(resolveDocumentImportMediaType(name, 'application/octet-stream')).toBe(mediaType);
    expect(documentFileTypeFromMediaType(mediaType.toUpperCase())).toBe(type);
  });

  test('preserves specific media types and does not admit generic or legacy binary files', () => {
    expect(resolveDocumentImportMediaType('renamed.pdf', 'image/png')).toBe('image/png');
    expect(resolveDocumentImportMediaType('old.doc', 'application/msword')).toBe(
      'application/msword',
    );
    expect(documentFileTypeFromMediaType('application/msword')).toBeUndefined();
    expect(resolveDocumentImportMediaType('archive.zip')).toBe('application/octet-stream');
    expect(documentFileTypeFromMediaType('application/octet-stream')).toBeUndefined();
  });
});
