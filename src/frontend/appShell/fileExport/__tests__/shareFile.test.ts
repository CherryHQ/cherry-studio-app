import type { ExportSignature, ExportWatermark } from '@/shared/contracts/fileExport';
import { FileEntrySchema } from '@/shared/data/types/file';

import { shareFile, shareFiles } from '../shareFile';

const mockCopy = jest.fn();
const mockShare = jest.fn();
const mockShareMultiple = jest.fn();
const mockAvailable = jest.fn();
const mockCreateDirectory = jest.fn();
const mockRelease = jest.fn();
const mockPrepareExport = jest.fn();

jest.mock('../prepareImageExport', () => ({
  prepareFileExport: (...args: unknown[]) => mockPrepareExport(...args),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'export-operation' }));

jest.mock('expo-file-system', () => ({
  Directory: jest.fn((...parts: string[]) => ({
    create: (options: unknown) => mockCreateDirectory(options),
    uri: parts.join('/'),
  })),
  File: jest.fn((base: string | { uri: string }, name?: string) => ({
    copy: (destination: unknown, options: unknown) => mockCopy(destination, options),
    uri: [typeof base === 'string' ? base : base.uri, name].filter(Boolean).join('/'),
  })),
  Paths: { cache: 'file:///cache' },
}));
jest.mock('react-native-share', () => ({
  __esModule: true,
  default: { open: (options: unknown) => mockShareMultiple(options) },
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => mockAvailable(),
  shareAsync: (uri: string, options: unknown) => mockShare(uri, options),
}));

const entry = FileEntrySchema.parse({
  createdAt: 1,
  filename: '笔记.md',
  id: '00000000-0000-7000-8000-000000000001',
  mediaType: 'text/markdown',
  provenance: 'generated',
  size: 2_000_000,
  updatedAt: 2,
});
const signature: ExportSignature = {
  background: '#ffffff',
  foreground: '#000000',
  brandName: 'Cherry Studio',
  timestamp: '2026.09.16 18:00',
  logoDataUrl: 'data:image/png;base64,AA==',
};

const watermark: ExportWatermark = { kind: 'cherry', signature };

beforeEach(() => {
  jest.clearAllMocks();
  mockAvailable.mockResolvedValue(true);
  mockCopy.mockResolvedValue(undefined);
  mockShare.mockResolvedValue(undefined);
  mockPrepareExport.mockImplementation(async ({ entry, uri }) => ({
    uri,
    filename: entry.filename,
    mediaType: entry.mediaType,
    release: mockRelease,
  }));
});

it('shares a copy with the display filename and original media type, independent of the viewer limit', async () => {
  await shareFile({ entry, uri: 'file:///managed/id.md' }, { watermark });
  expect(mockCopy).toHaveBeenCalledWith(
    expect.objectContaining({
      uri: `file:///cache/FileExports/${entry.id}/2/笔记.md`,
    }),
    { overwrite: true },
  );
  expect(mockShare).toHaveBeenCalledWith(`file:///cache/FileExports/${entry.id}/2/笔记.md`, {
    dialogTitle: '笔记.md',
    mimeType: 'text/markdown',
  });
});

it('does not present a partial export when copying fails', async () => {
  mockCopy.mockRejectedValueOnce(new Error('out of space'));
  await expect(shareFile({ entry, uri: 'file:///managed/id.md' }, { watermark })).rejects.toThrow(
    'out of space',
  );
  expect(mockShare).not.toHaveBeenCalled();
  expect(mockRelease).toHaveBeenCalledTimes(1);
});

it('delivers the signed PNG copy with a matching filename and MIME type', async () => {
  const imageEntry = FileEntrySchema.parse({
    ...entry,
    filename: '作品.jpg',
    mediaType: 'image/jpeg',
  });
  mockPrepareExport.mockResolvedValueOnce({
    uri: 'file:///signed.png',
    filename: '作品.png',
    mediaType: 'image/png',
    release: mockRelease,
  });
  await shareFile({ entry: imageEntry, uri: 'file:///managed/original.jpg' }, { watermark });
  expect(mockShare).toHaveBeenCalledWith(
    `file:///cache/FileExports/${entry.id}/export-operation/作品.png`,
    {
      dialogTitle: '作品.png',
      mimeType: 'image/png',
    },
  );
  expect(mockRelease).toHaveBeenCalledTimes(1);
});

it('does not share the unmarked original after signature generation fails', async () => {
  mockPrepareExport.mockRejectedValueOnce(new Error('Cannot render signature'));
  await expect(shareFile({ entry, uri: 'file:///managed/id.md' }, { watermark })).rejects.toThrow(
    'Cannot render signature',
  );
  expect(mockCopy).not.toHaveBeenCalled();
  expect(mockShare).not.toHaveBeenCalled();
});

it('shares all pages in order through one chooser without re-encoding them', async () => {
  const files = [1, 2, 3].map((index) => ({
    entry: FileEntrySchema.parse({
      ...entry,
      id: `00000000-0000-7000-8000-${String(index).padStart(12, '0')}`,
      filename: `conversation-${index}.png`,
      mediaType: 'image/png',
      provenance: 'document-export',
    }),
    uri: `file:///managed/${index}.png`,
  }));
  await shareFiles(async () => files, { watermark });
  expect(mockCopy).toHaveBeenCalledTimes(3);
  expect(mockShare).not.toHaveBeenCalled();
  expect(mockShareMultiple).toHaveBeenCalledWith({
    urls: files.map(({ entry }) => `file:///cache/FileExports/${entry.id}/2/${entry.filename}`),
    type: 'image/png',
    failOnCancel: false,
    useInternalStorage: true,
  });
});

it('never opens a partial multi-image share if a later page copy fails', async () => {
  mockCopy.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('No space'));
  const file = { entry, uri: 'file:///managed/page.png' };
  await expect(shareFiles([file, file], { watermark })).rejects.toThrow('No space');
  expect(mockShareMultiple).not.toHaveBeenCalled();
  expect(mockShare).not.toHaveBeenCalled();
});

it('cancellation after copying stops delivery without deleting files another receiver may still use', async () => {
  const controller = new AbortController();
  mockCopy.mockImplementationOnce(async () => controller.abort());
  await expect(
    shareFiles([{ entry, uri: 'file:///managed/page.png' }], {
      watermark,
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(mockShare).not.toHaveBeenCalled();
  expect(mockShareMultiple).not.toHaveBeenCalled();
});

it('checks availability before generating or persisting a file', async () => {
  mockAvailable.mockResolvedValueOnce(false);
  const generate = jest.fn();
  await expect(shareFile(generate, { watermark })).rejects.toMatchObject({ code: 'unavailable' });
  expect(generate).not.toHaveBeenCalled();
  expect(mockPrepareExport).not.toHaveBeenCalled();
  expect(mockShare).not.toHaveBeenCalled();
});

it.each(['prepare', 'copy'])(
  'cancellation during %s releases prepared bytes without opening the sheet',
  async (stage) => {
    const controller = new AbortController();
    if (stage === 'prepare') {
      mockPrepareExport.mockImplementationOnce(async ({ entry, uri }) => {
        controller.abort();
        return { uri, filename: entry.filename, mediaType: entry.mediaType, release: mockRelease };
      });
    } else {
      mockCopy.mockImplementationOnce(async () => controller.abort());
    }
    await expect(
      shareFile({ entry, uri: 'file:///managed/id.md' }, { watermark, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockShare).not.toHaveBeenCalled();
  },
);
