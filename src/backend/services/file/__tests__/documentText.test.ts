import {
  MAX_DOCUMENT_ATTACHMENT_BYTES,
  MAX_PDF_ATTACHMENT_BYTES,
} from '@/shared/utils/fileAttachmentPolicy';

import { extractPdfText } from '../../../../../modules/pdf-text-extractor';
import { DocumentTextError, readDocumentUriText, subscribePdfOcr } from '../documentText';
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
    ocrError: false,
  });
});

describe('managed document text', () => {
  test('uses the existing native PDF parser with a page ceiling and preserves incomplete extraction', async () => {
    mockFile.size = MAX_PDF_ATTACHMENT_BYTES;
    await expect(
      readDocumentUriText(URI, 'application/pdf', new AbortController().signal),
    ).resolves.toEqual({
      text: 'PDF body',
      truncated: true,
    });
    expect(extractPdfText).toHaveBeenCalledWith(
      URI,
      { maxPages: 100 },
      { signal: expect.any(AbortSignal), onProgress: expect.any(Function) },
    );
    expect(readFileUriBytes).not.toHaveBeenCalled();
  });

  test('rejects an oversized managed blob before native extraction', async () => {
    mockFile.size = MAX_PDF_ATTACHMENT_BYTES + 1;
    await expect(
      readDocumentUriText(URI, 'application/pdf', new AbortController().signal),
    ).rejects.toMatchObject({ failure: 'file-bytes' });
    expect(extractPdfText).not.toHaveBeenCalled();
  });

  test('keeps the Office ceiling smaller than the PDF ceiling before reading bytes', async () => {
    mockFile.size = MAX_DOCUMENT_ATTACHMENT_BYTES + 1;
    await expect(
      readDocumentUriText(
        'file:///managed/document.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ failure: 'file-bytes' });
    expect(readFileUriBytes).not.toHaveBeenCalled();
    expect(extractPdfText).not.toHaveBeenCalled();
  });

  test('rejects an empty result after native extraction and OCR', async () => {
    jest.mocked(extractPdfText).mockResolvedValueOnce({
      text: '  ',
      totalPages: 1,
      extractedPages: 1,
      isTruncated: false,
      extractionError: false,
      ocrError: false,
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
      ocrError: false,
    });
    await expect(
      readDocumentUriText(URI, 'application/pdf', new AbortController().signal),
    ).rejects.toMatchObject({ failure: 'invalid' });
  });

  test('distinguishes unreadable scanned pages from a damaged PDF and rejects partial text', async () => {
    jest.mocked(extractPdfText).mockResolvedValueOnce({
      text: 'Native first page',
      totalPages: 2,
      extractedPages: 1,
      isTruncated: false,
      extractionError: true,
      ocrError: true,
    });
    await expect(
      readDocumentUriText(URI, 'application/pdf', new AbortController().signal),
    ).rejects.toMatchObject({ failure: 'ocr' });
  });

  test('preserves ordered native and recognized page text and clears OCR activity on failure', async () => {
    const activity = jest.fn();
    const unsubscribe = subscribePdfOcr(activity);
    const controller = new AbortController();
    try {
      jest.mocked(extractPdfText).mockImplementationOnce(async (_uri, _options, control) => {
        expect(control?.signal).toBe(controller.signal);
        control?.onProgress?.({ requestId: 'one', completedPages: 1, totalPages: 2, phase: 'ocr' });
        return {
          text: 'Native page\n\n扫描文字',
          totalPages: 2,
          extractedPages: 2,
          isTruncated: false,
          extractionError: false,
          ocrError: false,
        };
      });
      await expect(readDocumentUriText(URI, 'application/pdf', controller.signal)).resolves.toEqual(
        {
          text: 'Native page\n\n扫描文字',
          truncated: false,
        },
      );
      expect(activity.mock.calls).toEqual([[false], [true], [false]]);

      activity.mockClear();
      jest.mocked(extractPdfText).mockImplementationOnce(async (_uri, _options, control) => {
        control?.onProgress?.({ requestId: 'two', completedPages: 0, totalPages: 1, phase: 'ocr' });
        throw new Error('Native OCR failure');
      });
      await expect(
        readDocumentUriText(URI, 'application/pdf', controller.signal),
      ).rejects.toMatchObject({ failure: 'invalid' });
      expect(activity.mock.calls).toEqual([[true], [false]]);
    } finally {
      unsubscribe();
    }
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
        ocrError: false,
      };
    });
    await expect(readDocumentUriText(URI, 'application/pdf', controller.signal)).rejects.toThrow(
      'cancelled',
    );
  });
});
