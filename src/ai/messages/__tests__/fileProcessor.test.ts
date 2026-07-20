import type { FileUIPart } from '@/data/types/message';

import { materializeNativeFilePart } from '../fileProcessor';

// ── Mocks ────────────────────────────────────────────────────────────

const mockBase64 = jest.fn();
const mockType = jest.fn();

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

beforeEach(() => {
  mockBase64.mockReset();
  mockType.mockReset();
});

// ── Helpers ──────────────────────────────────────────────────────────

const filePart = (overrides: Partial<Omit<FileUIPart, 'type'>> = {}): FileUIPart =>
  ({
    type: 'file',
    url: 'file:///tmp/test.pdf',
    mediaType: 'application/pdf',
    filename: 'report.pdf',
    ...overrides,
  }) as FileUIPart;

// ── Tests ────────────────────────────────────────────────────────────

describe('materializeNativeFilePart', () => {
  it('rewrites a file:// URL to a base64 data URL', async () => {
    mockBase64.mockResolvedValue('dGVzdA==');
    mockType.mockReturnValue('application/pdf');

    const result = await materializeNativeFilePart(filePart());

    expect(result).toEqual({
      type: 'file',
      url: 'data:application/pdf;base64,dGVzdA==',
      mediaType: 'application/pdf',
      filename: 'report.pdf',
    });
  });

  it('falls back to part.mediaType when file.type is empty', async () => {
    mockBase64.mockResolvedValue('aGVsbG8=');
    mockType.mockReturnValue('');

    const result = await materializeNativeFilePart(filePart({ mediaType: 'image/png' }));

    expect(result).toEqual({
      type: 'file',
      url: 'data:image/png;base64,aGVsbG8=',
      mediaType: 'image/png',
      filename: 'report.pdf',
    });
  });

  it('falls back to application/octet-stream when neither file nor part has a type', async () => {
    mockBase64.mockResolvedValue('aGVsbG8=');
    mockType.mockReturnValue('');

    const result = await materializeNativeFilePart(
      filePart({ mediaType: undefined as unknown as string }),
    );

    expect(result).toEqual({
      type: 'file',
      url: 'data:application/octet-stream;base64,aGVsbG8=',
      mediaType: 'application/octet-stream',
      filename: 'report.pdf',
    });
  });

  it('accepts content:// URIs (Android)', async () => {
    mockBase64.mockResolvedValue('Y29udGVudA==');
    mockType.mockReturnValue('text/plain');

    const result = await materializeNativeFilePart(
      filePart({ url: 'content://media/picker/photo.jpg' }),
    );

    expect(result).toEqual({
      type: 'file',
      url: 'data:text/plain;base64,Y29udGVudA==',
      mediaType: 'text/plain',
      filename: 'report.pdf',
    });
  });

  it('leaves data: URLs untouched', async () => {
    const part = filePart({ url: 'data:image/png;base64,iVBORw0KGgo=' });

    const result = await materializeNativeFilePart(part);

    expect(result).toBe(part);
  });

  it('leaves https: URLs untouched', async () => {
    const part = filePart({ url: 'https://example.com/file.pdf' });

    const result = await materializeNativeFilePart(part);

    expect(result).toBe(part);
  });

  it('leaves http: URLs untouched', async () => {
    const part = filePart({ url: 'http://example.com/file.pdf' });

    const result = await materializeNativeFilePart(part);

    expect(result).toBe(part);
  });

  it('returns the part unchanged when URL is empty', async () => {
    const part = filePart({ url: '' });

    const result = await materializeNativeFilePart(part);

    expect(result).toBe(part);
  });

  it('returns the part unchanged when URL is undefined', async () => {
    const part = filePart({ url: undefined as unknown as string });

    const result = await materializeNativeFilePart(part);

    expect(result).toBe(part);
  });

  it('returns null when base64 read fails', async () => {
    mockBase64.mockRejectedValue(new Error('file not found'));

    const result = await materializeNativeFilePart(filePart());

    expect(result).toBeNull();
  });
});
