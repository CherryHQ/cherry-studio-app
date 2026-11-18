import {
  MAX_DOCUMENT_ATTACHMENT_BYTES,
  MAX_PDF_ATTACHMENT_BYTES,
} from '@/shared/utils/fileAttachmentPolicy';

import { readDeepseekOcr } from '../deepseekOcr';
import { DocumentTextError, readDocumentUriText } from '../documentText';
import { readFileUriBytes } from '../fileStorage';
import { getFileOcrEngine, readPdfText } from '../fileTextExtraction';

const mockFile = { size: 64, exists: true };
jest.mock('expo-file-system', () => ({ File: jest.fn(() => mockFile) }));
jest.mock('../fileTextExtraction', () => ({
  getFileOcrEngine: jest.fn(() => 'local'),
  readPdfText: jest.fn(),
}));
jest.mock('../deepseekOcr', () => ({ readDeepseekOcr: jest.fn() }));
jest.mock('../fileStorage', () => ({ readFileUriBytes: jest.fn() }));
const URI = 'file:///managed/document.pdf';
const extracted = {
  text: '  PDF body  ',
  totalPages: 101,
  extractedPages: 100,
  isTruncated: true,
  extractionError: false,
  ocrError: false,
  ocrUnavailable: false,
  unrecognizedPages: [],
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getFileOcrEngine).mockReturnValue('local');
  mockFile.size = 64;
  mockFile.exists = true;
  jest.mocked(readPdfText).mockResolvedValue(extracted);
});

test('uses cloud OCR for PDF only without changing the built-in Office parser', async () => {
  jest.mocked(getFileOcrEngine).mockReturnValue('deepseek');
  jest.mocked(readDeepseekOcr).mockResolvedValueOnce(extracted);
  await expect(
    readDocumentUriText(URI, 'application/pdf', new AbortController().signal),
  ).resolves.toMatchObject({ text: 'PDF body', parser: 'deepseek-ocr' });
  await expect(
    readDocumentUriText(URI, 'application/msword', new AbortController().signal),
  ).rejects.toMatchObject({ failure: 'invalid' });
  expect(readDeepseekOcr).toHaveBeenCalledTimes(1);
  expect(readPdfText).not.toHaveBeenCalled();
});

test('explicit document parsing uses DeepSeek for Word even when image OCR stays local', async () => {
  jest.mocked(readDeepseekOcr).mockResolvedValueOnce({ ...extracted, text: 'Cloud Word text' });
  await expect(
    readDocumentUriText(URI, 'application/msword', new AbortController().signal, 'deepseek'),
  ).resolves.toMatchObject({ text: 'Cloud Word text', parser: 'deepseek-ocr' });
  expect(readPdfText).not.toHaveBeenCalled();
});

test('retains the extraction ceiling separately from unreadable image pages', async () => {
  mockFile.size = MAX_PDF_ATTACHMENT_BYTES;
  await expect(
    readDocumentUriText(URI, 'application/pdf', new AbortController().signal),
  ).resolves.toEqual({ text: 'PDF body', truncated: true });
});

test('rejects missing and oversized sources before consulting cached text', async () => {
  mockFile.exists = false;
  await expect(
    readDocumentUriText(URI, 'application/pdf', new AbortController().signal),
  ).rejects.toMatchObject({ failure: 'invalid' });
  mockFile.exists = true;
  mockFile.size = MAX_PDF_ATTACHMENT_BYTES + 1;
  await expect(
    readDocumentUriText(URI, 'application/pdf', new AbortController().signal),
  ).rejects.toMatchObject({ failure: 'file-bytes' });
  expect(readPdfText).not.toHaveBeenCalled();
});

test('keeps the smaller Office byte ceiling', async () => {
  mockFile.size = MAX_DOCUMENT_ATTACHMENT_BYTES + 1;
  await expect(
    readDocumentUriText(
      URI,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ failure: 'file-bytes' });
  expect(readFileUriBytes).not.toHaveBeenCalled();
});

test('rejects a document with no readable text even if it has unrecognized image pages', async () => {
  jest.mocked(readPdfText).mockResolvedValue({ ...extracted, text: ' ', unrecognizedPages: [1] });
  await expect(
    readDocumentUriText(URI, 'application/pdf', new AbortController().signal),
  ).rejects.toMatchObject({ failure: 'empty' });
});

test('names an unsupported recognition language instead of an unreadable scan', async () => {
  jest
    .mocked(readPdfText)
    .mockResolvedValue({ ...extracted, text: '', ocrUnavailable: true, unrecognizedPages: [1] });
  await expect(
    readDocumentUriText(URI, 'application/pdf', new AbortController().signal),
  ).rejects.toMatchObject({ failure: 'ocr-unsupported' });
  // Readable pages still send; skipped image pages surface as unrecognized.
  jest.mocked(readPdfText).mockResolvedValue({
    ...extracted,
    text: 'Native page',
    ocrUnavailable: true,
    unrecognizedPages: [2],
  });
  await expect(
    readDocumentUriText(URI, 'application/pdf', new AbortController().signal),
  ).resolves.toMatchObject({ unrecognizedPages: [2] });
});

test.each([
  [{ extractionError: true, ocrError: false }, 'invalid'],
  [{ extractionError: true, ocrError: true }, 'ocr'],
])('rejects partial content on actual parser/engine errors: %s', async (flags, failure) => {
  jest.mocked(readPdfText).mockResolvedValue({ ...extracted, ...flags });
  await expect(
    readDocumentUriText(URI, 'application/pdf', new AbortController().signal),
  ).rejects.toMatchObject({ failure });
});

test('retains the readable body and explicitly identifies pages with no recognized image text', async () => {
  jest.mocked(readPdfText).mockResolvedValue({
    ...extracted,
    text: 'Native page\n\n扫描文字',
    isTruncated: false,
    unrecognizedPages: [1, 3],
  });
  const result = await readDocumentUriText(URI, 'application/pdf', new AbortController().signal);
  expect(result.unrecognizedPages).toEqual([1, 3]);
  expect(result.truncated).toBe(false);
  expect(result.text).toMatch(/^\[PDF extraction notice: pages 1, 3 /);
  expect(result.text).toContain('Native page\n\n扫描文字');
});

test('redacts parser errors and discards a result after caller cancellation', async () => {
  jest.mocked(readPdfText).mockRejectedValueOnce(new Error(`Private path ${URI}`));
  await expect(
    readDocumentUriText(URI, 'application/pdf', new AbortController().signal),
  ).rejects.toEqual(new DocumentTextError('invalid'));
  const controller = new AbortController();
  jest.mocked(readPdfText).mockImplementationOnce(async () => {
    controller.abort(new Error('cancelled'));
    return extracted;
  });
  await expect(readDocumentUriText(URI, 'application/pdf', controller.signal)).rejects.toThrow(
    'cancelled',
  );
});
