import { FileEntrySchema } from '@/shared/data/types/file';

import { shareFile } from '../shareFile';

const mockCopy = jest.fn();
const mockShare = jest.fn();
const mockCreateDirectory = jest.fn();

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
