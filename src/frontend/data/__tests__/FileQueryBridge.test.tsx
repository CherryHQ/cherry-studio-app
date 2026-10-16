import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import { useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { Backend, ResolvedFile } from '@/shared/contracts';
import type { Painting } from '@/shared/data/types/painting';

import { BackendProvider } from '../BackendProvider';
import { FileQueryBridge } from '../FileQueryBridge';
import {
  resolvedPaintingFilesQueryOptions,
  usePaintingGalleryItems,
} from '../paintings/usePaintings';

jest.mock('expo-image', () => ({ Image: { loadAsync: jest.fn() } }));

const file: ResolvedFile = {
  entry: {
    id: 'output-1',
    filename: 'generated.png',
    mediaType: 'image/png',
    provenance: 'generated',
    size: 1024,
    createdAt: 1,
    updatedAt: 1,
  },
  uri: 'file:///generated.png',
};
const painting: Painting = {
  boardId: 'board-1',
  brief: null,
  createdAt: '2026-10-15T00:00:00.000Z',
  files: { input: ['input-1'], output: [file.entry.id] },
  id: 'painting-1',
  modelId: 'provider::image',
  orderKey: 'a0',
  prompt: 'A miniature city',
  providerId: 'provider',
  updatedAt: '2026-10-15T00:00:00.000Z',
};
const unrelatedPainting: Painting = {
  ...painting,
  id: 'painting-2',
  files: { input: [], output: ['output-2'] },
};
const paintings = [painting, unrelatedPainting];

it.each([false, true])(
  'refreshes trash and restore projections with an active board query: %s',
  async (observeBoard) => {
    let trashed = false;
    let changed!: (id: string) => void;
    let boardFiles: string[] | undefined;
    let galleryFiles: string[] = [];
    const unsubscribe = jest.fn();
    const resolveFiles = jest.fn(async (current: Painting) => ({
      inputs: [],
      outputs: current.id === painting.id && !trashed ? [file] : [],
    }));
    const backend = {
      file: {
        subscribeChanges: (listener: (id: string) => void) => {
          changed = listener;
          return unsubscribe;
        },
      },
      paintings: { resolveFiles },
    } as unknown as Backend;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    jest.mocked(ExpoImage.loadAsync).mockResolvedValue({ height: 1024, width: 1024 } as never);

    function Probe() {
      const board = useQuery({
        ...resolvedPaintingFilesQueryOptions(backend.paintings, painting),
        enabled: observeBoard,
      });
      const gallery = usePaintingGalleryItems(paintings);
      useLayoutEffect(() => {
        boardFiles = board.data?.outputs.map(({ entry }) => entry.id);
        galleryFiles = gallery.data.map((item) => item.fileEntryId);
      });
      return null;
    }

    let renderer: ReactTestRenderer | undefined;
    try {
      await act(async () => {
        renderer = create(
          <QueryClientProvider client={client}>
            <BackendProvider backend={backend}>
              <FileQueryBridge />
              <Probe />
            </BackendProvider>
          </QueryClientProvider>,
        );
      });
      await waitForCondition(() => galleryFiles.length === 1);
      expect(galleryFiles).toEqual([file.entry.id]);
      expect(boardFiles).toEqual([file.entry.id]);

      trashed = true;
      await act(async () => changed(file.entry.id));
      await waitForCondition(() => galleryFiles.length === 0 && boardFiles?.length === 0);

      trashed = false;
      await act(async () => changed(file.entry.id));
      await waitForCondition(() => galleryFiles.length === 1 && boardFiles?.length === 1);
      expect(galleryFiles).toEqual([file.entry.id]);
      expect(boardFiles).toEqual([file.entry.id]);

      // Inputs participate even when the resolver currently returns no file for them.
      const beforeInputChange = resolveFiles.mock.calls.length;
      await act(async () => changed('input-1'));
      await waitForCondition(() => resolveFiles.mock.calls.length > beforeInputChange);
      expect(
        resolveFiles.mock.calls.filter(([current]) => current.id === unrelatedPainting.id),
      ).toHaveLength(1);
    } finally {
      await act(async () => renderer?.unmount());
      client.clear();
    }
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  },
);

async function waitForCondition(predicate: () => boolean) {
  for (let index = 0; index < 20; index += 1) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  throw new Error('Timed out waiting for painting file projections');
}
