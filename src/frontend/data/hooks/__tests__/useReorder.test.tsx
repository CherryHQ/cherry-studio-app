import { type InfiniteData, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import { dataApiCollectionFilters } from '@/frontend/data/utils/optimisticQueryUpdate';
import type { ApiClient, CursorPaginationResponse } from '@/shared/data/api/types';

import { useReorder } from '../useReorder';

type Row = { id: string; name: string };

const dataApi = {
  delete: jest.fn(),
  get: jest.fn(),
  patch: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
} as jest.Mocked<ApiClient>;

let queryClient: QueryClient;
let renderer: ReactTestRenderer | undefined;

function renderHookHarness<TItem extends { id: string }>(
  options: Parameters<typeof useReorder<TItem>>[0],
) {
  let latest!: ReturnType<typeof useReorder<TItem>>;
  function Harness() {
    latest = useReorder(options);
    return null;
  }

  act(() => {
    renderer = create(
      <QueryClientProvider client={queryClient}>
        <DataApiProvider dataApi={dataApi}>
          <Harness />
        </DataApiProvider>
      </QueryClientProvider>,
    );
  });

  return () => latest;
}

describe('useReorder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dataApi.patch.mockResolvedValue(undefined as never);
    queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { gcTime: Infinity, retry: false },
      },
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    queryClient.clear();
  });

  it('optimistically updates flat, counted, and infinite caches and dispatches single vs batch PATCH', async () => {
    const initial: Row[] = [
      { id: 'cherry', name: 'Cherry' },
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Beta' },
      { id: 'c', name: 'Gamma' },
    ];
    queryClient.setQueryData(['/providers'], initial);
    queryClient.setQueryData<InfiniteData<CursorPaginationResponse<Row>, string | undefined>>(
      ['/providers/page', { limit: 2 }],
      {
        pageParams: [undefined, 'c1'],
        pages: [
          { items: [initial[0], initial[1]], nextCursor: 'c1' },
          { items: [initial[2], initial[3]], nextCursor: undefined },
        ],
      },
    );

    const getHook = renderHookHarness<Row>({
      getId: (item) => item.id,
      queryFilters: [
        dataApiCollectionFilters('/providers'),
        dataApiCollectionFilters('/providers/page'),
      ],
      resource: '/providers',
    });

    // Single move inside subgroup [a, b, c] -> [c, a, b]
    const movableOld = initial.slice(1);
    const movableNew = [initial[3], initial[1], initial[2]];
    await act(async () => {
      await expect(getHook().reorder(movableOld, movableNew)).resolves.toBe(true);
    });

    expect(dataApi.patch).toHaveBeenCalledTimes(1);
    expect(dataApi.patch).toHaveBeenCalledWith('/providers/c/order', {
      body: { before: 'a' },
    });
    expect(queryClient.getQueryData<Row[]>(['/providers'])?.map((r) => r.id)).toEqual([
      'cherry',
      'c',
      'a',
      'b',
    ]);
    expect(
      queryClient
        .getQueryData<InfiniteData<CursorPaginationResponse<Row>, string | undefined>>([
          '/providers/page',
          { limit: 2 },
        ])
        ?.pages.map((p) => p.items.map((r) => r.id)),
    ).toEqual([
      ['cherry', 'c'],
      ['a', 'b'],
    ]);

    // Multi-move batch: reverse [c, a, b] -> [b, a, c]
    await act(async () => {
      await expect(
        getHook().reorder(movableNew, [initial[2], initial[1], initial[3]]),
      ).resolves.toBe(true);
    });
    expect(dataApi.patch).toHaveBeenNthCalledWith(2, '/providers/order:batch', {
      body: {
        moves: [
          { anchor: { before: 'c' }, id: 'b' },
          { anchor: { after: 'b' }, id: 'a' },
        ],
      },
    });
  });

  it('encodes slash-containing ids cleanly for model order endpoint', async () => {
    const items: Row[] = [
      { id: 'openai::gpt-4o', name: 'GPT-4o' },
      { id: 'openai::org/model', name: 'Org Model' },
    ];
    queryClient.setQueryData(['/models', { providerId: 'openai' }], items);

    const getHook = renderHookHarness<Row>({
      getId: (item) => item.id,
      queryFilters: [dataApiCollectionFilters('/models')],
      resource: '/models',
    });

    await act(async () => {
      await expect(getHook().reorderIndex(items, 1, 0)).resolves.toBe(true);
    });

    expect(dataApi.patch).toHaveBeenCalledWith('/models/openai%3A%3Aorg%2Fmodel/order', {
      body: { before: 'openai::gpt-4o' },
    });
  });

  it('rolls back optimistic caches and reports error when PATCH rejects', async () => {
    const initial: Row[] = [
      { id: '1', name: 'One' },
      { id: '2', name: 'Two' },
    ];
    queryClient.setQueryData(['/agents', { limit: 100 }], { items: initial, page: 1, total: 2 });
    const onError = jest.fn();
    const failure = new Error('write failed');
    dataApi.patch.mockRejectedValueOnce(failure);

    const getHook = renderHookHarness<Row>({
      getId: (item) => item.id,
      onError,
      queryFilters: [dataApiCollectionFilters('/agents')],
      resource: '/agents',
    });

    await act(async () => {
      await expect(getHook().reorderIndex(initial, 1, 0)).resolves.toBe(false);
    });

    expect(onError).toHaveBeenCalledWith(failure);
    expect(
      queryClient.getQueryData<{ items: Row[]; page: number; total: number }>([
        '/agents',
        { limit: 100 },
      ])?.items,
    ).toEqual(initial);
  });
});
