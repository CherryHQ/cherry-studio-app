import type { FileUIPart } from '@/data/types/message';

import { resolveFileUIPart } from '../fileProcessor';

// jest.mock factories MUST be inline function expressions, not variable references.
// Jest hoists jest.mock calls before all imports/variables, so captured
// outer-scope refs are undefined at factory-evaluation time.
// Inline the mock function creation so it lives inside the hoisted factory.

jest.mock('expo-file-system', () => ({
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: 'base64' },
}));

jest.mock('expo', () => {
  // Create a stable mock function that always returns the same { extractText }.
  // The extractText reference captured here persists for the test file's lifetime.
  const extractText = jest.fn();
  const requireNativeModule = jest.fn(() => ({ extractText }));
  // Expose both on the requireNativeModule fn so tests can find them
  (requireNativeModule as unknown as Record<string, unknown>)._extractText = extractText;
  return { requireNativeModule };
});

// Accessors that reach into the hoisted mock closure.
function getRequireNativeModule(): jest.Mock {
  return jest.mocked(require('expo').requireNativeModule);
}

function getExtractText(): jest.Mock {
  return (getRequireNativeModule() as unknown as Record<string, unknown>)._extractText as jest.Mock;
}

// --- Helpers ---

const fileUrl = (path: string) => `file://${path}`;

const filePart = (overrides: Partial<FileUIPart> = {}): FileUIPart =>
  ({
    type: 'file',
    url: fileUrl('/tmp/test.pdf'),
    mediaType: 'application/pdf',
    filename: 'report.pdf',
    ...overrides,
  }) as FileUIPart;

// --- Tests ---

describe('resolveFileUIPart', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('PDF path (mediaType === application/pdf)', () => {
    it('returns a text part with extracted text on success', async () => {
      getExtractText().mockResolvedValueOnce({
        text: 'Hello world\ntest content',
        totalPages: 1,
        extractedPages: 1,
        isTruncated: false,
      });

      const result = await resolveFileUIPart(filePart());
      expect(result).toEqual({
        type: 'text',
        text: `Attached file "report.pdf":\nHello world\ntest content`,
      });
    });

    it('returns a note when extraction returns empty text', async () => {
      getExtractText().mockResolvedValueOnce({
        text: '',
        totalPages: 1,
        extractedPages: 0,
        isTruncated: false,
      });

      const result = await resolveFileUIPart(filePart());
      expect(result).toEqual({
        type: 'text',
        text: `Attached file "report.pdf": [could not read this file].`,
      });
    });

    it('returns a note when extraction returns whitespace-only text', async () => {
      getExtractText().mockResolvedValueOnce({
        text: '   \n  ',
        totalPages: 1,
        extractedPages: 0,
        isTruncated: false,
      });

      const result = await resolveFileUIPart(filePart());
      expect(result).toEqual({
        type: 'text',
        text: `Attached file "report.pdf": [could not read this file].`,
      });
    });

    it('returns a note when native module throws', async () => {
      getExtractText().mockRejectedValueOnce(new Error('native crash'));

      const result = await resolveFileUIPart(filePart());
      expect(result).toEqual({
        type: 'text',
        text: `Attached file "report.pdf": [could not read this file].`,
      });
    });

    it('returns a note when the file path is empty', async () => {
      const result = await resolveFileUIPart(filePart({ url: 'file://' }));
      expect(result).toEqual({
        type: 'text',
        text: `Attached file "report.pdf": [could not read this file].`,
      });
    });

    it('truncates text longer than PDF_TEXT_CAP', async () => {
      const longText = 'A'.repeat(9000);
      getExtractText().mockResolvedValueOnce({
        text: longText,
        totalPages: 100,
        extractedPages: 50,
        isTruncated: true,
      });

      const result = await resolveFileUIPart(filePart());
      expect(result).toEqual({
        type: 'text',
        text: expect.stringMatching(
          /^Attached file "report\.pdf":\nA{8000}\n\n\[Truncated 8000\/9000 chars\.\]$/,
        ),
      });
    });

    it('does not add truncation note when text fits within the cap', async () => {
      getExtractText().mockResolvedValueOnce({
        text: 'Short PDF content',
        totalPages: 1,
        extractedPages: 1,
        isTruncated: false,
      });

      const result = await resolveFileUIPart(filePart());
      expect(result).toEqual({
        type: 'text',
        text: `Attached file "report.pdf":\nShort PDF content`,
      });
    });

    it('falls back to default name when part.filename is absent', async () => {
      getExtractText().mockResolvedValueOnce({
        text: 'some content',
        totalPages: 1,
        extractedPages: 1,
        isTruncated: false,
      });

      const result = await resolveFileUIPart(filePart({ filename: undefined }) as FileUIPart);
      expect(result).toEqual({
        type: 'text',
        text: `Attached file "file":\nsome content`,
      });
    });
  });

  describe('Non-PDF path (existing base64 behavior)', () => {
    it('returns a base64 data URL for non-PDF files', async () => {
      jest.mocked(require('expo-file-system').readAsStringAsync).mockResolvedValueOnce('cGQ=');
      const part = filePart({
        url: fileUrl('/tmp/photo.jpg'),
        mediaType: 'image/jpeg',
        filename: 'photo.jpg',
      });

      const result = await resolveFileUIPart(part);
      expect(result).toEqual({
        type: 'file',
        url: 'data:image/jpeg;base64,cGQ=',
        mediaType: 'image/jpeg',
        filename: 'photo.jpg',
      });
    });

    it('returns null when base64 read fails', async () => {
      jest
        .mocked(require('expo-file-system').readAsStringAsync)
        .mockRejectedValueOnce(new Error('file not found'));
      const part = filePart({
        url: fileUrl('/tmp/missing.txt'),
        mediaType: 'text/plain',
      });

      const result = await resolveFileUIPart(part);
      expect(result).toBeNull();
    });
  });

  describe('URL guards', () => {
    it('returns the part unchanged when URL is null', async () => {
      const part = filePart({ url: undefined as unknown as string });
      const result = await resolveFileUIPart(part);
      expect(result).toBe(part);
    });

    it('returns the part unchanged for data: URLs', async () => {
      const part = filePart({
        url: 'data:image/png;base64,iVBORw0KGgo=',
        mediaType: 'image/png',
      });
      const result = await resolveFileUIPart(part);
      expect(result).toBe(part);
    });

    it('returns the part unchanged for https: URLs', async () => {
      const part = filePart({
        url: 'https://example.com/file.pdf',
        mediaType: 'application/pdf',
      });
      const result = await resolveFileUIPart(part);
      expect(result).toBe(part);
    });
  });
});
