import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type EffectCallback, type ReactNode, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BackendProvider } from '@/frontend/data/BackendProvider';
import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import type { Backend } from '@/shared/contracts';
import type { ApiClient } from '@/shared/data/api/types';
import { FileEntrySchema } from '@/shared/data/types/file';

import { useFileEntries } from '../useFileEntries';

let focusEffect: EffectCallback | undefined;

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: EffectCallback) => {
    focusEffect = effect;
  },
}));

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
const backend = {
  file: { generatePreviewUri, resolveUris },
} as unknown as Backend;

let latestResult: ReturnType<typeof useFileEntries> | undefined;
let queryClient: QueryClient;
let renderer: ReactTestRenderer | undefined;

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <BackendProvider backend={backend}>
        <DataApiProvider dataApi={dataApi}>{children}</DataApiProvider>
      </BackendProvider>
    </QueryClientProvider>
  );
}

function Probe({ enabled }: { enabled: boolean }) {
  const result = useFileEntries('all', { enabled });

  useEffect(() => {
    latestResult = result;
  }, [result]);

  return null;
}

describe('useFileEntries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    focusEffect = undefined;
    completePreview = undefined;
    latestResult = undefined;
    queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity, retry: false } },
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    queryClient.clear();
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

    await act(async () => focusEffect?.());
    expect(dataApi.get).not.toHaveBeenCalled();

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

    await act(async () => focusEffect?.());
    expect(dataApi.get).toHaveBeenCalledTimes(1);
    await act(async () => focusEffect?.());
    await flushQueryNotifications();
    expect(dataApi.get).toHaveBeenCalledTimes(2);
  });
});

async function flushQueryNotifications() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
