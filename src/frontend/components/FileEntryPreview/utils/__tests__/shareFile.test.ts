import { FileEntrySchema } from '@/shared/data/types/file';

import { shareFile, shareFiles } from '../shareFile';

const mockCopy = jest.fn();
const mockShare = jest.fn();
const mockCreateDirectory = jest.fn();
const mockMultiShare = jest.fn();

jest.mock('../../../../../../modules/file-sharing', () => ({
  getFileSharing: () => ({ shareFiles: mockMultiShare }),
}));

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
jest.mock('expo-sharing', () => ({
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

beforeEach(() => {
  jest.clearAllMocks();
  mockCopy.mockResolvedValue(undefined);
  mockShare.mockResolvedValue(undefined);
  mockMultiShare.mockResolvedValue(undefined);
});

it('shares a copy with the display filename and original media type, independent of the viewer limit', async () => {
  await shareFile({ entry, uri: 'file:///managed/id.md' });
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
  await expect(shareFile({ entry, uri: 'file:///managed/id.md' })).rejects.toThrow('out of space');
  expect(mockShare).not.toHaveBeenCalled();
});

const images = [1, 2].map((index) => ({
  entry: FileEntrySchema.parse({
    ...entry,
    id: `00000000-0000-7000-8000-00000000000${index}`,
    filename: `document-00${index}.webp`,
    mediaType: 'image/webp',
  }),
  uri: `file:///managed/${index}.webp`,
}));

it('opens one system sheet containing every retained image in reading order', async () => {
  await shareFiles(images);
  expect(mockMultiShare).toHaveBeenCalledTimes(1);
  expect(mockMultiShare).toHaveBeenCalledWith(
    images.map(({ entry }) => `file:///cache/FileExports/${entry.id}/2/${entry.filename}`),
    'image/webp',
    'document-001.webp',
  );
  expect(mockCopy).toHaveBeenCalledTimes(2);
  expect(mockShare).not.toHaveBeenCalled();
});

it('a failed later copy never opens a sheet with only the first image', async () => {
  mockCopy.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Copy failed'));
  await expect(shareFiles(images)).rejects.toThrow('Copy failed');
  expect(mockMultiShare).not.toHaveBeenCalled();
  expect(mockShare).not.toHaveBeenCalled();
});

it('closing while preparing copies stops delivery before opening a system sheet', async () => {
  const controller = new AbortController();
  mockCopy.mockImplementationOnce(async () => {
    controller.abort();
  });
  await expect(shareFiles(images, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(mockCopy).toHaveBeenCalledTimes(1);
  expect(mockMultiShare).not.toHaveBeenCalled();
});
