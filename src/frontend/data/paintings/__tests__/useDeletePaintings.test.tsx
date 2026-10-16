import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BackendProvider, useQuery } from '@/frontend/data';
import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import type { Backend } from '@/shared/contracts';
import type { ApiClient } from '@/shared/data/api/types';
import type { Painting } from '@/shared/data/types/painting';

import { useDeletePaintings } from '../usePaintings';

jest.mock('../usePaintingJobs', () => ({
  usePaintingJobs: () => ({ activeByPaintingId: new Map() }),
}));

const root: Painting = {
  boardId: 'board-1',
  brief: null,
  createdAt: '2026-10-15T00:00:00.000Z',
  files: { input: [], output: ['root-image'] },
  id: 'root',
  modelId: 'provider::image',
  orderKey: 'a0',
  prompt: 'A miniature city',
  providerId: 'provider',
  updatedAt: '2026-10-15T00:00:00.000Z',
};
const child: Painting = {
  ...root,
  files: { input: ['root-image'], output: ['child-image'] },
  id: 'child',
  orderKey: 'a1',
};
const backend = { paintings: {} } as Backend;
let storedPaintings: Painting[];
const dataApi = {
  delete: jest.fn(async (_path: string, options?: { query?: { ids: readonly string[] } }) => {
    storedPaintings = storedPaintings.filter(
      (painting) => !options?.query?.ids.includes(painting.id),
    );
  }),
  get: jest.fn(async (path: string) => {
    if (path === '/painting-boards/board-1/paintings') return [...storedPaintings];
    throw new Error(`Unexpected query: ${path}`);
  }),
} as unknown as jest.Mocked<ApiClient>;

let deletePaintings: ReturnType<typeof useDeletePaintings>;
let visibleIds: string[] = [];
let queryClient: QueryClient;
let renderer: ReactTestRenderer | undefined;

function Probe() {
  const remove = useDeletePaintings();
  const paintings = useQuery('/painting-boards/:id/paintings', { params: { id: 'board-1' } });
  useLayoutEffect(() => {
    deletePaintings = remove;
    visibleIds = paintings.data?.map(({ id }) => id) ?? [];
  });
  return null;
}

beforeEach(async () => {
  jest.clearAllMocks();
  storedPaintings = [root, child];
  visibleIds = [];
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={queryClient}>
        <BackendProvider backend={backend}>
          <DataApiProvider dataApi={dataApi}>
            <Probe />
          </DataApiProvider>
        </BackendProvider>
      </QueryClientProvider>,
    );
  });
  await waitForCondition(() => visibleIds.length === 2);
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  queryClient.clear();
});

it('refreshes the visible board after deleting a completed version', async () => {
  await act(async () => {
    await deletePaintings(['child']);
  });
  await waitForCondition(() => visibleIds.length === 1);

  expect(visibleIds).toEqual(['root']);
  expect(dataApi.delete).toHaveBeenCalledWith('/paintings', { query: { ids: ['child'] } });
});

async function waitForCondition(predicate: () => boolean) {
  for (let index = 0; index < 20; index += 1) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  throw new Error('Timed out waiting for board queries');
}
