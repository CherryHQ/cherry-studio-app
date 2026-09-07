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
    ['legacy.doc', 'application/msword', 'doc'],
    ['legacy.ppt', 'application/vnd.ms-powerpoint', 'ppt'],
    ['legacy.xls', 'application/vnd.ms-excel', 'xls'],
    ['document.odt', 'application/vnd.oasis.opendocument.text', 'odt'],
    ['sheet.ods', 'application/vnd.oasis.opendocument.spreadsheet', 'ods'],
    ['slides.odp', 'application/vnd.oasis.opendocument.presentation', 'odp'],
    ['text.rtf', 'application/rtf', 'rtf'],
    ['book.epub', 'application/epub+zip', 'epub'],
  ])('fills missing picker metadata for %s before persistence', (name, mediaType, type) => {
    expect(resolveDocumentImportMediaType(name)).toBe(mediaType);
    expect(resolveDocumentImportMediaType(name, 'application/octet-stream')).toBe(mediaType);
    expect(documentFileTypeFromMediaType(mediaType.toUpperCase())).toBe(type);
  });

  test('preserves specific media types and does not admit generic binary files', () => {
    expect(resolveDocumentImportMediaType('renamed.pdf', 'image/png')).toBe('image/png');
    expect(resolveDocumentImportMediaType('old.doc', 'application/msword')).toBe(
      'application/msword',
    );
    expect(documentFileTypeFromMediaType('application/msword')).toBe('doc');
    expect(documentFileTypeFromMediaType('text/rtf')).toBe('rtf');
    expect(documentFileTypeFromMediaType('text/rtf;charset=utf-8')).toBe('rtf');
    expect(resolveDocumentImportMediaType('archive.zip')).toBe('application/octet-stream');
    expect(documentFileTypeFromMediaType('application/octet-stream')).toBeUndefined();
  });
});
