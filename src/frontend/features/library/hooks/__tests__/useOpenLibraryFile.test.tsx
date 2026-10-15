import { useLayoutEffect } from 'react';
import { act, create } from 'react-test-renderer';

import type { ResolvedFile } from '@/shared/contracts/file';
import { FileEntrySchema } from '@/shared/data/types/file';

import { useOpenLibraryFile } from '../useOpenLibraryFile';

const mockPush = jest.fn();
const mockOpenFileEntry = jest.fn();
const mockGet = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/frontend/components/FileEntryPreview', () => ({
  useOpenFileEntry: () => ({ openFileEntry: mockOpenFileEntry }),
}));
jest.mock('@/frontend/data/DataApiProvider', () => ({ useApiClient: () => ({ get: mockGet }) }));

function file(provenance: 'generated' | 'imported', mediaType = 'image/png'): ResolvedFile {
  return {
    entry: FileEntrySchema.parse({
      createdAt: 1,
      filename: 'image.png',
      id: '00000000-0000-4000-8000-000000000001',
      mediaType,
      provenance,
      size: 1,
      updatedAt: 1,
    }),
    uri: 'file:///image.png',
  };
}

let open: ReturnType<typeof useOpenLibraryFile>;
function Probe() {
  const current = useOpenLibraryFile();
  useLayoutEffect(() => {
    open = current;
  });
  return null;
}

describe('useOpenLibraryFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      create(<Probe />);
    });
  });

  it('opens the painting board focused on an image a painting generated', async () => {
    mockGet.mockResolvedValue({ id: 'painting-1' });

    await act(() => open(file('generated')));

    expect(mockGet).toHaveBeenCalledWith(
      '/paintings/by-output/00000000-0000-4000-8000-000000000001',
    );
    expect(mockPush).toHaveBeenCalledWith({
      params: { fileEntryId: '00000000-0000-4000-8000-000000000001', paintingId: 'painting-1' },
      pathname: '/paintings',
    });
    expect(mockOpenFileEntry).not.toHaveBeenCalled();
  });

  it('falls back to the file viewer when no painting owns the generated image', async () => {
    mockGet.mockResolvedValue(null);

    await act(() => open(file('generated')));

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockOpenFileEntry).toHaveBeenCalledTimes(1);
  });

  it('falls back to the file viewer when the lookup fails', async () => {
    mockGet.mockRejectedValue(new Error('offline'));

    await act(() => open(file('generated')));

    expect(mockOpenFileEntry).toHaveBeenCalledTimes(1);
  });

  it('opens imported images and generated documents without asking for a painting', async () => {
    await act(() => open(file('imported')));
    await act(() => open(file('generated', 'text/plain')));

    expect(mockGet).not.toHaveBeenCalled();
    expect(mockOpenFileEntry).toHaveBeenCalledTimes(2);
  });
});
