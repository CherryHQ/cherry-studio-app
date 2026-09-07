import { MAX_DOCUMENT_ATTACHMENT_BYTES } from '@/shared/utils/fileAttachmentPolicy';

import { extractPdfText } from '../../../../../modules/pdf-text-extractor';
import { DocumentTextError, readDocumentUriText } from '../documentText';
import { readFileUriBytes } from '../fileStorage';

const mockFile = { size: 64 };

jest.mock('expo-file-system', () => ({ File: jest.fn(() => mockFile) }));
jest.mock('../../../../../modules/pdf-text-extractor', () => ({ extractPdfText: jest.fn() }));
jest.mock('../fileStorage', () => ({ readFileUriBytes: jest.fn() }));

const URI = 'file:///managed/document.pdf';

beforeEach(() => {
  jest.clearAllMocks();
  mockFile.size = 64;
  jest.mocked(extractPdfText).mockResolvedValue({
    text: '  PDF body  ',
    totalPages: 101,
    extractedPages: 100,
    isTruncated: true,
    extractionError: false,
  });
});

describe('managed document text', () => {
  test('uses the existing native PDF parser with a page ceiling and preserves incomplete extraction', async () => {
    await expect(
      readDocumentUriText(URI, 'application/pdf', new AbortController().signal),
    ).resolves.toEqual({
      text: 'PDF body',
      truncated: true,
    });
    expect(extractPdfText).toHaveBeenCalledWith(URI, { maxPages: 100 });
    expect(readFileUriBytes).not.toHaveBeenCalled();
  });

  test('rejects an oversized managed blob before native extraction', async () => {
    mockFile.size = MAX_DOCUMENT_ATTACHMENT_BYTES + 1;
    await expect(
      readDocumentUriText(URI, 'application/pdf', new AbortController().signal),
    ).rejects.toMatchObject({ failure: 'file-bytes' });
    expect(extractPdfText).not.toHaveBeenCalled();
  });

  test('rejects an image-only PDF instead of claiming its text was sent', async () => {
    jest.mocked(extractPdfText).mockResolvedValueOnce({
      text: '  ',
      totalPages: 1,
      extractedPages: 1,
      isTruncated: false,
      extractionError: false,
    });
    await expect(
      readDocumentUriText(URI, 'application/pdf', new AbortController().signal),
    ).rejects.toMatchObject({ failure: 'empty' });
  });

  test('does not send partial content when native extraction reports an error', async () => {
    jest.mocked(extractPdfText).mockResolvedValueOnce({
      text: 'partial',
      totalPages: 2,
      extractedPages: 2,
      isTruncated: false,
      extractionError: true,
    });
    await expect(
      readDocumentUriText(URI, 'application/pdf', new AbortController().signal),
    ).rejects.toMatchObject({ failure: 'invalid' });
  });

  test('redacts native parser errors and propagates cancellation', async () => {
    jest
      .mocked(extractPdfText)
      .mockRejectedValueOnce(new Error(`Could not open private path ${URI}`));
    await expect(
      readDocumentUriText(URI, 'application/pdf', new AbortController().signal),
    ).rejects.toEqual(new DocumentTextError('invalid'));

    const controller = new AbortController();
    jest.mocked(extractPdfText).mockImplementationOnce(async () => {
      controller.abort(new Error('cancelled'));
      return {
        text: 'late result',
        totalPages: 1,
        extractedPages: 1,
        isTruncated: false,
        extractionError: false,
      };
    });
    await expect(readDocumentUriText(URI, 'application/pdf', controller.signal)).rejects.toThrow(
      'cancelled',
    );
  });
});
