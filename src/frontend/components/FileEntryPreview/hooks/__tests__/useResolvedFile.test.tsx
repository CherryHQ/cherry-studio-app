import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BackendProvider } from '@/frontend/data/BackendProvider';
import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import { FileQueryBridge } from '@/frontend/data/FileQueryBridge';
import type { Backend } from '@/shared/contracts';
import type { ApiClient } from '@/shared/data/api/types';
import { FileEntrySchema } from '@/shared/data/types/file';

import { useResolvedFile } from '../useResolvedFile';

const entry = FileEntrySchema.parse({
  id: '00000000-0000-7000-8000-000000000001',
  filename: 'notes.txt',
  mediaType: 'text/plain',
  provenance: 'imported',
  size: 12,
  createdAt: 1,
  updatedAt: 1,
});

it('hides cached file references when trashed and revives them with the same id after restoration', async () => {
  let trashed = false;
  let changed!: (id: string) => void;
  let snapshot!: ReturnType<typeof useResolvedFile>;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const dataApi = {
    get: async () => {
      if (trashed) throw new Error('File entry is unavailable');
      return entry;
    },
  } as unknown as ApiClient;
  const backend = {
    file: {
      getUri: async () => (trashed ? undefined : 'file:///managed/notes.txt'),
      subscribeChanges: (listener: (id: string) => void) => {
        changed = listener;
        return () => {};
      },
    },
  } as unknown as Backend;

  function Probe() {
    const result = useResolvedFile(entry.id);
    useEffect(() => {
      snapshot = result;
    }, [result]);
    return null;
  }
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={client}>
        <BackendProvider backend={backend}>
          <DataApiProvider dataApi={dataApi}>
            <FileQueryBridge />
            <Probe />
          </DataApiProvider>
        </BackendProvider>
      </QueryClientProvider>,
    );
  });
  try {
    await act(async () => {
      await snapshot.refetch();
    });
    expect(snapshot.data?.uri).toBe('file:///managed/notes.txt');
    trashed = true;
    await act(async () => {
      changed(entry.id);
      await snapshot.refetch();
    });
    expect(snapshot.data).toBeNull();
    trashed = false;
    await act(async () => {
      changed(entry.id);
      await snapshot.refetch();
    });
    expect(snapshot.data).toEqual({ entry, uri: 'file:///managed/notes.txt' });
  } finally {
    act(() => renderer.unmount());
    client.clear();
  }
});
