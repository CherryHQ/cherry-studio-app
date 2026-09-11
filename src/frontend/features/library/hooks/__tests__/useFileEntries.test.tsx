import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BackendProvider } from '@/frontend/data/BackendProvider';
import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import { FileQueryBridge } from '@/frontend/data/FileQueryBridge';
import { queryKeys } from '@/frontend/data/queryKeys';
import type { Backend } from '@/shared/contracts';
import type { ApiClient } from '@/shared/data/api/types';
import { FileEntrySchema, type FileEntryId } from '@/shared/data/types/file';

import { useFileEntries, type FileLibraryFilter } from '../useFileEntries';

// Exercise the real classifier without loading native preview components.
jest.mock('@/frontend/components/FileEntryPreview', () =>
  jest.requireActual('@/frontend/components/FileEntryPreview/utils/fileEntryPresentation'),
);

const entry = FileEntrySchema.parse({
  createdAt: 1,
  filename: 'photo.png',
  id: '00000000-0000-4000-8000-000000000001',
  mediaType: 'image/png',
  provenance: 'imported',
  size: 128,
  updatedAt: 1,
});
const documentEntry = FileEntrySchema.parse({
  createdAt: 2,
  filename: 'notes.pdf',
  id: '00000000-0000-4000-8000-000000000002',
  mediaType: 'application/pdf',
  provenance: 'imported',
  size: 256,
  updatedAt: 2,
});
const generatedEntry = FileEntrySchema.parse({
  createdAt: 3,
  filename: 'generated.txt',
  id: '00000000-0000-4000-8000-000000000003',
  mediaType: 'text/plain',
  provenance: 'generated',
  size: 512,
  updatedAt: 3,
});
const dataApi = {
  delete: jest.fn(),
  get: jest.fn(async () => ({ items: [entry, documentEntry] })),
  patch: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
} as unknown as jest.Mocked<ApiClient>;
const resolveUris = jest.fn(async (entries: readonly (typeof entry)[]) =>
  entries.map((item) => {
    const uri = `file:///documents/${item.filename}`;
    return { previewUri: item.mediaType.startsWith('image/') ? undefined : uri, uri };
  }),
);
let completePreview: ((uri: string | undefined) => void) | undefined;
const generatePreviewUri = jest.fn(
  async () =>
    await new Promise<string | undefined>((resolve) => {
      completePreview = resolve;
    }),
);
const fileChangeListeners = new Set<(entryId: FileEntryId) => void>();
const backend = {
  file: {
    generatePreviewUri,
    resolveUris,
    subscribeChanges: (listener: (entryId: FileEntryId) => void) => {
      fileChangeListeners.add(listener);
      return () => fileChangeListeners.delete(listener);
    },
  },
} as unknown as Backend;

let latestResult: ReturnType<typeof useFileEntries> | undefined;
let queryClient: QueryClient;
let renderer: ReactTestRenderer | undefined;

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <BackendProvider backend={backend}>
        <DataApiProvider dataApi={dataApi}>
          <FileQueryBridge />
          {children}
        </DataApiProvider>
      </BackendProvider>
    </QueryClientProvider>
  );
}

function Probe({ enabled, filter = 'all' }: { enabled: boolean; filter?: FileLibraryFilter }) {
  const result = useFileEntries(filter, { enabled });

  useEffect(() => {
    latestResult = result;
  }, [result]);

  return null;
}

describe('useFileEntries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    completePreview = undefined;
    latestResult = undefined;
    queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity, retry: false, staleTime: 30_000 } },
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    queryClient.clear();
  });

  test('sharing partitions the same loaded pages by source while keeping exported images in the image tab', async () => {
    const exportedImage = FileEntrySchema.parse({
      ...entry,
      id: '00000000-0000-4000-8000-000000000010',
      provenance: 'document-export',
    });
    const exportedDocument = FileEntrySchema.parse({
      ...documentEntry,
      id: '00000000-0000-4000-8000-000000000011',
      provenance: 'document-export',
    });
    dataApi.get.mockResolvedValueOnce({
      items: [exportedImage, generatedEntry, exportedDocument, entry],
    });
    await act(async () => {
      renderer = create(
        <Providers>
          <Probe enabled filter="sharing" />
        </Providers>,
      );
    });
    await flushQueryNotifications();
    await flushQueryNotifications();
    expect(latestResult?.entries.map((item) => item.entry.id)).toEqual([
      exportedImage.id,
      exportedDocument.id,
    ]);
    await act(async () => {
      renderer?.update(
        <Providers>
          <Probe enabled filter="image" />
        </Providers>,
      );
    });
    await flushQueryNotifications();
    expect(latestResult?.entries.map((item) => item.entry.id)).toEqual([
      exportedImage.id,
      entry.id,
    ]);
    expect(dataApi.get).toHaveBeenCalledTimes(1);
  });

  test('keeps the loading state without fetching until data loading is enabled', async () => {
    await act(async () => {
      renderer = create(
        <Providers>
          <Probe enabled={false} />
        </Providers>,
      );
    });

    expect(dataApi.get).not.toHaveBeenCalled();
    expect(generatePreviewUri).not.toHaveBeenCalled();
    expect(resolveUris).not.toHaveBeenCalled();
    expect(latestResult?.entries).toEqual([]);
    expect(latestResult?.isLoading).toBe(true);

    await act(async () => {
      renderer?.update(
        <Providers>
          <Probe enabled />
        </Providers>,
      );
    });
    await flushQueryNotifications();
    await flushQueryNotifications();

    expect(dataApi.get).toHaveBeenCalledTimes(1);
    expect(dataApi.get).toHaveBeenCalledWith('/files/entries', {
      query: { cursor: undefined, limit: 30 },
    });
    expect(resolveUris).toHaveBeenCalledTimes(1);
    expect(resolveUris).toHaveBeenCalledWith([entry, documentEntry]);
    expect(generatePreviewUri).toHaveBeenCalledTimes(1);
    expect(generatePreviewUri).toHaveBeenCalledWith(entry);
    expect(latestResult?.entries).toEqual([
      {
        entry,
        previewUri: undefined,
        uri: 'file:///documents/photo.png',
      },
      {
        entry: documentEntry,
        previewUri: 'file:///documents/notes.pdf',
        uri: 'file:///documents/notes.pdf',
      },
    ]);
    expect(latestResult?.isLoading).toBe(false);

    const pendingImage = latestResult?.entries[0];
    const stableDocument = latestResult?.entries[1];
    await act(async () => completePreview?.(`file:///cache/${entry.id}.webp`));
    await flushQueryNotifications();

    expect(latestResult?.entries[0]).toEqual({
      entry,
      previewUri: `file:///cache/${entry.id}.webp`,
      uri: 'file:///documents/photo.png',
    });
    expect(latestResult?.entries[0]).not.toBe(pendingImage);
    expect(latestResult?.entries[1]).toBe(stableDocument);
  });

  test('generates previews for image media types with casing and parameters', async () => {
    const parameterizedImage = FileEntrySchema.parse({
      ...entry,
      mediaType: 'Image/PNG;charset=binary',
    });
    dataApi.get.mockResolvedValueOnce({ items: [parameterizedImage] });
    resolveUris.mockResolvedValueOnce([
      { previewUri: undefined, uri: 'file:///documents/photo.png' },
    ]);

    await act(async () => {
      renderer = create(
        <Providers>
          <Probe enabled />
        </Providers>,
      );
    });
    await flushQueryNotifications();
    await flushQueryNotifications();

    expect(generatePreviewUri).toHaveBeenCalledWith(parameterizedImage);
    await act(async () => completePreview?.(`file:///cache/${entry.id}.webp`));
    await flushQueryNotifications();
    expect(latestResult?.entries[0].previewUri).toBe(`file:///cache/${entry.id}.webp`);
  });

  test('reuses fresh shared pages until a file write invalidates them', async () => {
    await act(async () => {
      renderer = create(
        <Providers>
          <Probe enabled />
        </Providers>,
      );
    });
    await flushQueryNotifications();
    await flushQueryNotifications();
    expect(dataApi.get).toHaveBeenCalledTimes(1);

    await act(async () => renderer?.unmount());
    renderer = undefined;
    await act(async () => {
      renderer = create(
        <Providers>
          <Probe enabled />
        </Providers>,
      );
    });
    await flushQueryNotifications();
    expect(dataApi.get).toHaveBeenCalledTimes(1);
    expect(latestResult?.entries.map((item) => item.entry.id)).toEqual([
      entry.id,
      documentEntry.id,
    ]);

    // Background generation finishes with only the app-wide bridge mounted.
    await act(async () => renderer?.update(<Providers>{null}</Providers>));
    dataApi.get.mockResolvedValueOnce({ items: [generatedEntry, entry, documentEntry] });
    await act(async () => notifyFileChange(generatedEntry.id));
    expect(dataApi.get).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer?.update(
        <Providers>
          <Probe enabled />
        </Providers>,
      );
    });
    await flushQueryNotifications();
    await flushQueryNotifications();

    expect(dataApi.get).toHaveBeenCalledTimes(2);
    expect(latestResult?.entries.map((item) => item.entry.id)).toEqual([
      generatedEntry.id,
      entry.id,
      documentEntry.id,
    ]);
  });

  test('refreshes mounted file pages without invalidating unchanged URI and preview queries', async () => {
    await act(async () => {
      renderer = create(
        <Providers>
          <Probe enabled />
        </Providers>,
      );
    });
    await flushQueryNotifications();
    await flushQueryNotifications();
    await act(async () => completePreview?.(`file:///cache/${entry.id}.webp`));
    await flushQueryNotifications();

    const otherPageSizeKey = ['/files/entries', { limit: 10 }] as const;
    queryClient.setQueryData(otherPageSizeKey, { items: [entry, documentEntry] });
    queryClient.setQueryData(queryKeys.files.uri(entry.id), `file:///documents/${entry.filename}`);
    const viewerTextKey = queryKeys.files.viewerText(
      documentEntry,
      `file:///documents/${documentEntry.filename}`,
    );
    queryClient.setQueryData(viewerTextKey, 'cached viewer text');
    const previewKeys = [
      queryKeys.files.uri(entry.id),
      queryKeys.files.previewUri(entry),
      queryKeys.files.previewUriPage([entry, documentEntry]),
      viewerTextKey,
    ];
    const previews = previewKeys.map((key) => queryClient.getQueryData(key));

    dataApi.get.mockResolvedValueOnce({ items: [generatedEntry, entry, documentEntry] });
    await act(async () => notifyFileChange(generatedEntry.id));
    await flushQueryNotifications();
    await flushQueryNotifications();

    expect(latestResult?.entries.map((item) => item.entry.id)).toEqual([
      generatedEntry.id,
      entry.id,
      documentEntry.id,
    ]);
    expect(queryClient.getQueryState(otherPageSizeKey)?.isInvalidated).toBe(true);
    for (const [index, key] of previewKeys.entries()) {
      expect(queryClient.getQueryData(key)).toBe(previews[index]);
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
    }
    expect(generatePreviewUri).toHaveBeenCalledTimes(1);

    const rewrittenEntry = FileEntrySchema.parse({ ...generatedEntry, size: 1024 });
    dataApi.get.mockResolvedValueOnce({ items: [rewrittenEntry, entry, documentEntry] });
    await act(async () => notifyFileChange(generatedEntry.id));
    await flushQueryNotifications();
    await flushQueryNotifications();
    expect(latestResult?.entries[0].entry).toEqual(rewrittenEntry);

    // Deletion uses the same notification, regardless of which workflow owns it.
    dataApi.get.mockResolvedValueOnce({ items: [documentEntry] });
    await act(async () => notifyFileChange(entry.id));
    await flushQueryNotifications();
    await flushQueryNotifications();
    expect(latestResult?.entries.map((item) => item.entry.id)).toEqual([documentEntry.id]);
  });

  test('unsubscribes from file changes when the app provider unmounts', async () => {
    const pagesKey = ['/files/entries', { limit: 30 }] as const;
    queryClient.setQueryData(pagesKey, { items: [] });
    await act(async () => {
      renderer = create(<Providers>{null}</Providers>);
    });
    await act(async () => renderer?.unmount());
    renderer = undefined;

    notifyFileChange(generatedEntry.id);
    expect(queryClient.getQueryState(pagesKey)?.isInvalidated).toBe(false);
  });

  test('refreshes an open draft and its detail even when the timestamp has not changed', async () => {
    let currentEntry = generatedEntry;
    let content = 'old content';
    let displayedText: string | undefined;
    const detailKey = [`/files/entries/${generatedEntry.id}`];
    const textKey = queryKeys.files.viewerText(generatedEntry, 'file:///draft.txt');
    const affectedPage = queryKeys.files.previewUriPage([generatedEntry, documentEntry]);
    const otherTextKey = queryKeys.files.viewerText(documentEntry, 'file:///notes.pdf');
    const readText = jest.fn(async () => content);
    function DraftProbe() {
      const detail = useQuery({ queryKey: detailKey, queryFn: async () => currentEntry });
      const text = useQuery({ queryKey: textKey, queryFn: readText, staleTime: Infinity });
      useEffect(() => {
        displayedText = text.data;
      }, [detail.data, text.data]);
      return null;
    }
    queryClient.setQueryData(affectedPage, []);
    queryClient.setQueryData(otherTextKey, 'unchanged');
    await act(async () => {
      renderer = create(
        <Providers>
          <DraftProbe />
        </Providers>,
      );
    });
    await flushQueryNotifications();
    expect(displayedText).toBe('old content');

    content = 'rewritten content';
    currentEntry = FileEntrySchema.parse({ ...generatedEntry, size: 1024 });
    await act(async () => notifyFileChange(generatedEntry.id));
    await flushQueryNotifications();

    expect(displayedText).toBe('rewritten content');
    expect(readText).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryData(detailKey)).toEqual(currentEntry);
    expect(queryClient.getQueryState(affectedPage)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(otherTextKey)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryData(otherTextKey)).toBe('unchanged');
  });

  test.each(['entries', 'uris'] as const)(
    'exposes a failed %s load and recovers on retry',
    async (source) => {
      const error = new Error('File load failed');
      if (source === 'entries') dataApi.get.mockRejectedValueOnce(error);
      else resolveUris.mockRejectedValueOnce(error);
      await act(async () => {
        renderer = create(
          <Providers>
            <Probe enabled />
          </Providers>,
        );
      });
      await flushQueryNotifications();
      await flushQueryNotifications();

      expect(latestResult?.error).toBe(error);
      expect(latestResult?.entries).toEqual([]);
      expect(latestResult?.isLoading).toBe(false);
      const callsBeforeLoadMore = dataApi.get.mock.calls.length;
      await act(async () => latestResult?.loadMore());
      expect(dataApi.get).toHaveBeenCalledTimes(callsBeforeLoadMore);

      await act(async () => {
        await latestResult?.refresh();
      });
      await flushQueryNotifications();
      await flushQueryNotifications();
      expect(latestResult?.error).toBeUndefined();
      expect(latestResult?.entries.map((item) => item.entry.id)).toEqual([
        entry.id,
        documentEntry.id,
      ]);
    },
  );

  test('keeps loaded entries and stops automatic pagination after a later page fails', async () => {
    const error = new Error('Next page failed');
    dataApi.get.mockResolvedValueOnce({ items: [documentEntry], nextCursor: 'next' });
    dataApi.get.mockRejectedValueOnce(error);
    await act(async () => {
      renderer = create(
        <Providers>
          <Probe enabled />
        </Providers>,
      );
    });
    await flushQueryNotifications();
    await flushQueryNotifications();
    expect(latestResult?.error).toBe(error);
    expect(latestResult?.entries.map((item) => item.entry.id)).toEqual([documentEntry.id]);
    await act(async () => latestResult?.loadMore());
    await flushQueryNotifications();
    expect(dataApi.get).toHaveBeenCalledTimes(2);
  });
});

function notifyFileChange(entryId: FileEntryId) {
  for (const listener of fileChangeListeners) listener(entryId);
}

async function flushQueryNotifications() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
