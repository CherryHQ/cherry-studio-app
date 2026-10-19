import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BackendProvider } from '@/frontend/data/BackendProvider';
import { DataApiProvider } from '@/frontend/data/DataApiProvider';
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
  jest.useFakeTimers();
  let trashed = false;
  let changed!: (paths: readonly string[]) => void;
  let snapshot!: ReturnType<typeof useResolvedFile>;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const dataApi = {
    subscribeChanges: (listener: (paths: readonly string[]) => void) => {
      changed = listener;
      return () => {};
    },
    get: async () => {
      if (trashed) throw new Error('File entry is unavailable');
      return entry;
    },
  } as unknown as ApiClient;
  const backend = {
    file: {
      getUri: async () => (trashed ? undefined : 'file:///managed/notes.txt'),
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
            <Probe />
          </DataApiProvider>
        </BackendProvider>
      </QueryClientProvider>,
    );
  });
  try {
    await waitForCondition(() => snapshot.data?.uri === 'file:///managed/notes.txt');
    expect(snapshot.data?.uri).toBe('file:///managed/notes.txt');
    trashed = true;
    await act(async () => {
      changed([`/files/entries/${entry.id}`]);
    });
    await waitForCondition(() => snapshot.data === null);
    expect(snapshot.data).toBeNull();
    trashed = false;
    await act(async () => {
      changed([`/files/entries/${entry.id}`]);
    });
    await waitForCondition(() => snapshot.data?.uri === 'file:///managed/notes.txt');
    expect(snapshot.data).toEqual({ entry, uri: 'file:///managed/notes.txt' });
  } finally {
    await act(async () => renderer.unmount());
    client.clear();
    jest.useRealTimers();
  }
});

async function waitForCondition(predicate: () => boolean) {
  for (let index = 0; index < 20; index += 1) {
    if (predicate()) return;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });
  }
  throw new Error('Timed out waiting for the managed file reference');
}
