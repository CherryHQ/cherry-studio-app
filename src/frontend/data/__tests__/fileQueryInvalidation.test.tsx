import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import { useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { Backend, ResolvedFile } from '@/shared/contracts';
import type { ApiClient } from '@/shared/data/api/types';
import { FileEntrySchema } from '@/shared/data/types/file';
import type { Painting } from '@/shared/data/types/painting';

import { BackendProvider } from '../BackendProvider';
import { DataApiProvider } from '../DataApiProvider';
import {
  resolvedPaintingFilesQueryOptions,
  usePaintingGalleryItems,
} from '../paintings/usePaintings';

jest.mock('expo-image', () => ({ Image: { loadAsync: jest.fn() } }));

const file: ResolvedFile = {
  entry: FileEntrySchema.parse({
    id: '00000000-0000-7000-8000-000000000001',
    filename: 'generated.png',
    mediaType: 'image/png',
    provenance: 'generated',
    size: 1024,
    createdAt: 1,
    updatedAt: 1,
  }),
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
const dataApi = {
  delete: jest.fn(),
  get: jest.fn(),
  patch: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
} satisfies ApiClient;

it.each([1, 500])(
  'invalidates a burst of %i changed files in one cache pass without touching Sessions',
  async (count) => {
    jest.useFakeTimers();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    let changed!: (paths: readonly string[]) => void;
    const unsubscribe = jest.fn();
    const api: ApiClient = {
      ...dataApi,
      subscribeChanges: (listener) => {
        changed = listener;
        return unsubscribe;
      },
    };
    client.setQueryData(['/files/library'], []);
    client.setQueryData(['/files/history', { id: 'lineage' }], []);
    client.setQueryData(['/agent-sessions'], []);
    client.setQueryData(['/agent-sessions/session'], {});
    client.setQueryData(['files', 'file-0', 123], {});
    client.setQueryData(['files', 'unrelated', 456], {});
    client.setQueryData(['files', 'preview-uri-page', [{ id: 'file-0', updatedAt: 123 }]], []);
    client.setQueryDefaults(['painting-files'], { meta: { fileEntryIds: ['file-0'] } });
    client.setQueryData(['painting-files'], {});
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    let renderer: ReactTestRenderer | undefined;
    try {
      await act(async () => {
        renderer = create(
          <QueryClientProvider client={client}>
            <DataApiProvider dataApi={api}>{null}</DataApiProvider>
          </QueryClientProvider>,
        );
      });
      for (let index = 0; index < count; index += 1)
        changed(['/files/library', '/files/history', `/files/entries/file-${index}`]);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(300);
      });
      expect(invalidate).toHaveBeenCalledTimes(1);
      expect(client.getQueryState(['/files/library'])?.isInvalidated).toBe(true);
      expect(client.getQueryState(['/files/history', { id: 'lineage' }])?.isInvalidated).toBe(true);
      expect(client.getQueryState(['files', 'file-0', 123])?.isInvalidated).toBe(true);
      expect(
        client.getQueryState(['files', 'preview-uri-page', [{ id: 'file-0', updatedAt: 123 }]])
          ?.isInvalidated,
      ).toBe(true);
      expect(client.getQueryState(['painting-files'])?.isInvalidated).toBe(true);
      expect(client.getQueryState(['files', 'unrelated', 456])?.isInvalidated).toBe(false);
      expect(client.getQueryState(['/agent-sessions'])?.isInvalidated).toBe(false);
      expect(client.getQueryState(['/agent-sessions/session'])?.isInvalidated).toBe(false);
    } finally {
      await act(async () => renderer?.unmount());
      client.clear();
      jest.useRealTimers();
    }
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  },
);

it.each([false, true])(
  'refreshes trash and restore projections with an active board query: %s',
  async (observeBoard) => {
    jest.useFakeTimers();
    let trashed = false;
    let changed!: (paths: readonly string[]) => void;
    let boardFiles: string[] | undefined;
    let galleryFiles: string[] = [];
    const unsubscribe = jest.fn();
    const resolveFiles = jest.fn(async (current: Painting) => ({
      inputs: [],
      outputs: current.id === painting.id && !trashed ? [file] : [],
    }));
    const api: ApiClient = {
      ...dataApi,
      subscribeChanges: (listener) => {
        changed = listener;
        return unsubscribe;
      },
    };
    const backend = {
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
              <DataApiProvider dataApi={api}>
                <Probe />
              </DataApiProvider>
            </BackendProvider>
          </QueryClientProvider>,
        );
      });
      await waitForCondition(() => galleryFiles.length === 1);
      expect(galleryFiles).toEqual([file.entry.id]);
      expect(boardFiles).toEqual([file.entry.id]);

      trashed = true;
      await act(async () => changed([`/files/entries/${file.entry.id}`]));
      await waitForCondition(() => galleryFiles.length === 0 && boardFiles?.length === 0);

      trashed = false;
      await act(async () => changed([`/files/entries/${file.entry.id}`]));
      await waitForCondition(() => galleryFiles.length === 1 && boardFiles?.length === 1);
      expect(galleryFiles).toEqual([file.entry.id]);
      expect(boardFiles).toEqual([file.entry.id]);

      // Inputs participate even when the resolver currently returns no file for them.
      const beforeInputChange = resolveFiles.mock.calls.length;
      await act(async () => changed(['/files/entries/input-1']));
      await waitForCondition(() => resolveFiles.mock.calls.length > beforeInputChange);
      expect(
        resolveFiles.mock.calls.filter(([current]) => current.id === unrelatedPainting.id),
      ).toHaveLength(1);
    } finally {
      await act(async () => renderer?.unmount());
      client.clear();
      jest.useRealTimers();
    }
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  },
);

async function waitForCondition(predicate: () => boolean) {
  for (let index = 0; index < 20; index += 1) {
    if (predicate()) return;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });
  }
  throw new Error('Timed out waiting for painting file projections');
}
