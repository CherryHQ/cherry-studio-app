import type { UIMessage } from 'ai';
import type { FileUIPart } from '@/data/types/message';
import { resolveUIMessageFileUrls } from '../messageConverter';
import type { MediaCapabilities } from '../messageCapabilities';

// ── Mocks ────────────────────────────────────────────────────────────

const mockBase64 = jest.fn();
const mockType = jest.fn();
const mockExtractText = jest.fn();

jest.mock('expo-file-system', () => {
  class MockFile {
    readonly uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get type(): string {
      return mockType();
    }
    async base64(): Promise<string> {
      return mockBase64();
    }
  }
  return { File: MockFile };
});

jest.mock('expo', () => {
  const nativeModule = jest.fn(() => ({ extractText: mockExtractText }));
  (nativeModule as unknown as { _extractText: typeof mockExtractText })._extractText =
    mockExtractText;
  return { requireOptionalNativeModule: nativeModule };
});

beforeEach(() => {
  mockBase64.mockReset();
  mockType.mockReset();
  mockExtractText.mockReset();
});

// ── Helpers ──────────────────────────────────────────────────────────

const NATIVE_ALL: MediaCapabilities = {
  image: true,
  pdf: true,
  audio: true,
  video: true,
};

const NATIVE_NO_PDF: MediaCapabilities = {
  image: true,
  pdf: false,
  audio: true,
  video: true,
};

function message(parts: UIMessage['parts']): UIMessage {
  return { id: 'msg-1', role: 'user', parts };
}

function filePart(overrides: Partial<Omit<FileUIPart, 'type'>> = {}): FileUIPart {
  return {
    type: 'file',
    url: 'file:///tmp/doc.pdf',
    mediaType: 'application/pdf',
    filename: 'report.pdf',
    ...overrides,
  } as FileUIPart;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('prepareChatMessages — routing', () => {
  describe('native path (inline base64)', () => {
    it('inlines a native PDF as base64 data URL', async () => {
      mockBase64.mockResolvedValue('cGRm');
      mockType.mockReturnValue('application/pdf');

      const [result] = await resolveUIMessageFileUrls([message([filePart()])], NATIVE_ALL);

      expect(result.parts).toEqual([
        expect.objectContaining({
          type: 'file',
          url: 'data:application/pdf;base64,cGRm',
          mediaType: 'application/pdf',
        }),
      ]);
    });

    it('inlines a native image as base64 data URL', async () => {
      mockBase64.mockResolvedValue('aW1hZ2U=');
      mockType.mockReturnValue('image/jpeg');

      const [result] = await resolveUIMessageFileUrls(
        [
          message([
            filePart({
              url: 'file:///tmp/photo.jpg',
              mediaType: 'image/jpeg',
              filename: 'photo.jpg',
            }),
          ]),
        ],
        NATIVE_ALL,
      );

      expect(result.parts).toEqual([
        expect.objectContaining({
          type: 'file',
          url: 'data:image/jpeg;base64,aW1hZ2U=',
          mediaType: 'image/jpeg',
        }),
      ]);
    });

    it('degrades to a note when native materialization fails', async () => {
      mockBase64.mockRejectedValue(new Error('disk error'));

      const [result] = await resolveUIMessageFileUrls([message([filePart()])], NATIVE_ALL);

      expect(result.parts).toEqual([
        { type: 'text', text: 'Attached file "report.pdf": [could not read this file].' },
      ]);
    });
  });

  describe('non-native PDF path (text extraction)', () => {
    it('extracts PDF text and returns a text part', async () => {
      mockExtractText.mockResolvedValue({
        text: 'Hello world\ntest content',
        totalPages: 1,
        extractedPages: 1,
        isTruncated: false,
      });

      const [result] = await resolveUIMessageFileUrls([message([filePart()])], NATIVE_NO_PDF);

      expect(result.parts).toEqual([
        { type: 'text', text: 'Attached file "report.pdf":\nHello world\ntest content' },
      ]);
      expect(mockExtractText).toHaveBeenCalledWith('file:///tmp/doc.pdf', { maxPages: 50 });
    });

    it('returns a note when extraction returns empty text', async () => {
      mockExtractText.mockResolvedValue({
        text: '',
        totalPages: 1,
        extractedPages: 0,
        isTruncated: false,
      });

      const [result] = await resolveUIMessageFileUrls([message([filePart()])], NATIVE_NO_PDF);

      expect(result.parts).toEqual([
        { type: 'text', text: 'Attached file "report.pdf": [could not read this file].' },
      ]);
    });

    it('returns a note when extraction returns whitespace-only text', async () => {
      mockExtractText.mockResolvedValue({
        text: '   \n  ',
        totalPages: 1,
        extractedPages: 0,
        isTruncated: false,
      });

      const [result] = await resolveUIMessageFileUrls([message([filePart()])], NATIVE_NO_PDF);

      expect(result.parts).toEqual([
        { type: 'text', text: 'Attached file "report.pdf": [could not read this file].' },
      ]);
    });

    it('returns a note when native module throws', async () => {
      mockExtractText.mockRejectedValue(new Error('native crash'));

      const [result] = await resolveUIMessageFileUrls([message([filePart()])], NATIVE_NO_PDF);

      expect(result.parts).toEqual([
        { type: 'text', text: 'Attached file "report.pdf": [could not read this file].' },
      ]);
    });

    it('returns a note when native module is unavailable', async () => {
      // requireOptionalNativeModule returns a wrapper whose extractText rejects,
      // but if the module itself is null, the camera-roll mock returns a falsy shape.
      // Force the module to return null by making the mock factory return null.
      jest.mocked(require('expo').requireOptionalNativeModule).mockReturnValueOnce(null);

      const [result] = await resolveUIMessageFileUrls([message([filePart()])], NATIVE_NO_PDF);

      expect(result.parts).toEqual([
        { type: 'text', text: 'Attached file "report.pdf": [could not read this file].' },
      ]);
    });

    it('truncates text longer than the cap', async () => {
      const longText = 'A'.repeat(9000);
      mockExtractText.mockResolvedValue({
        text: longText,
        totalPages: 100,
        extractedPages: 50,
        isTruncated: true,
      });

      const [result] = await resolveUIMessageFileUrls([message([filePart()])], NATIVE_NO_PDF);

      expect(result.parts).toEqual([
        {
          type: 'text',
          text: expect.stringMatching(
            /^Attached file "report\.pdf":\nA{8000}\n\n\[Truncated 8000\/9000 chars\.\]$/,
          ),
        },
      ]);
    });

    it('does not call materializeNativeFilePart for non-native PDF', async () => {
      mockExtractText.mockResolvedValue({
        text: 'extracted',
        totalPages: 1,
        extractedPages: 1,
        isTruncated: false,
      });

      await resolveUIMessageFileUrls([message([filePart()])], NATIVE_NO_PDF);

      // base64 should NOT be called — PDF goes through text extraction
      expect(mockBase64).not.toHaveBeenCalled();
    });
  });

  describe('non-file parts are left untouched', () => {
    it('passes through text parts unchanged', async () => {
      const [result] = await resolveUIMessageFileUrls(
        [message([{ type: 'text', text: 'hello' }])],
        NATIVE_NO_PDF,
      );

      expect(result.parts).toEqual([{ type: 'text', text: 'hello' }]);
    });

    it('passes through data: file URLs unchanged (already resolved)', async () => {
      const part = filePart({ url: 'data:image/png;base64,iVBORw0KGgo=' });

      const [result] = await resolveUIMessageFileUrls([message([part])], NATIVE_ALL);

      expect(result.parts).toEqual([part]);
    });

    it('passes through https: file URLs unchanged', async () => {
      const part = filePart({ url: 'https://example.com/file.pdf' });

      const [result] = await resolveUIMessageFileUrls([message([part])], NATIVE_ALL);

      expect(result.parts).toEqual([part]);
    });
  });

  describe('routing by media type', () => {
    it('routes an audio file as native when audio is supported', async () => {
      mockBase64.mockResolvedValue('YXVkaW8=');
      mockType.mockReturnValue('audio/mp3');

      const [result] = await resolveUIMessageFileUrls(
        [
          message([
            filePart({
              url: 'file:///tmp/sound.mp3',
              mediaType: 'audio/mp3',
              filename: 'sound.mp3',
            }),
          ]),
        ],
        { ...NATIVE_ALL, audio: true },
      );

      expect(result.parts).toEqual([
        expect.objectContaining({
          type: 'file',
          mediaType: 'audio/mp3',
          url: 'data:audio/mp3;base64,YXVkaW8=',
        }),
      ]);
    });

    it('routes a video file as native when video is supported', async () => {
      mockBase64.mockResolvedValue('dmlkZW8=');
      mockType.mockReturnValue('video/mp4');

      const [result] = await resolveUIMessageFileUrls(
        [
          message([
            filePart({
              url: 'file:///tmp/video.mp4',
              mediaType: 'video/mp4',
              filename: 'video.mp4',
            }),
          ]),
        ],
        { ...NATIVE_ALL, video: true },
      );

      expect(result.parts).toEqual([
        expect.objectContaining({
          type: 'file',
          mediaType: 'video/mp4',
          url: 'data:video/mp4;base64,dmlkZW8=',
        }),
      ]);
    });
  });

  describe('edge cases', () => {
    it('returns message unchanged for empty parts array', async () => {
      const msg = message([]);

      const [result] = await resolveUIMessageFileUrls([msg], NATIVE_ALL);

      expect(result).toBe(msg);
      expect(result.parts).toEqual([]);
    });

    it('returns message unchanged for missing parts', async () => {
      const msg = { id: 'msg-1', role: 'user' } as UIMessage;

      const [result] = await resolveUIMessageFileUrls([msg], NATIVE_ALL);

      expect(result).toBe(msg);
    });

    it('uses fallback filename for empty string filename', async () => {
      mockBase64.mockResolvedValue('cGRm');
      mockType.mockReturnValue('application/pdf');

      const [result] = await resolveUIMessageFileUrls(
        [message([filePart({ filename: '' })])],
        NATIVE_ALL,
      );

      expect(result.parts).toEqual([
        expect.objectContaining({
          type: 'file',
          url: 'data:application/pdf;base64,cGRm',
          mediaType: 'application/pdf',
        }),
      ]);
    });

    it('routes a non-native non-PDF file to an unsupported modal message', async () => {
      const caps: MediaCapabilities = { image: false, video: false, audio: false, pdf: false };

      const [result] = await resolveUIMessageFileUrls(
        [message([filePart({ mediaType: 'image/png', filename: 'photo.png' })])],
        caps,
      );

      expect(result.parts).toEqual([
        {
          type: 'text',
          text: '[image attachment omitted: this model does not accept image input]',
        },
      ]);
      expect(mockExtractText).not.toHaveBeenCalled();
    });

    it('routes a native-fallback non-PDF file (application/octet-stream) to an unsupported modal message', async () => {
      const caps: MediaCapabilities = { image: false, video: false, audio: false, pdf: false };

      const [result] = await resolveUIMessageFileUrls(
        [message([filePart({ mediaType: 'application/octet-stream', filename: 'data.bin' })])],
        caps,
      );

      expect(result.parts).toEqual([
        { type: 'text', text: '[file attachment omitted: this model does not accept file input]' },
      ]);
      expect(mockExtractText).not.toHaveBeenCalled();
    });

    it('produces a note when file part has no URL in the non-native path', async () => {
      const caps: MediaCapabilities = { image: false, video: false, audio: false, pdf: false };

      const [result] = await resolveUIMessageFileUrls([message([filePart({ url: '' })])], caps);

      expect(result.parts).toEqual([
        { type: 'text', text: 'Attached file "report.pdf": [could not read this file].' },
      ]);
    });
  });
});
