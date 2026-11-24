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

    expect(dataApi.patch).toHaveBeenCalledWith('/model-orders/openai%3A%3Aorg%2Fmodel', {
      body: { before: 'openai::gpt-4o' },
    });
  });

  it('cancels drags based on a rolled-back order and accepts the next fresh drag', async () => {
    const [a, b, c] = ['a', 'b', 'c'].map((id) => ({ id, name: id }));
    const initial = [a, b, c];
    queryClient.setQueryData(['/agents'], initial);
    const onError = jest.fn();
    const getHook = renderHookHarness<Row>({
      getId: (item) => item.id,
      onError,
      queryFilters: [dataApiCollectionFilters('/agents')],
      resource: '/agents',
    });
    const started = Promise.withResolvers<void>();
    const write = Promise.withResolvers<never>();
    dataApi.patch.mockImplementationOnce(() => {
      started.resolve();
      return write.promise;
    });

    await act(async () => {
      const first = getHook().reorder(initial, [c, a, b]);
      await started.promise;
      const displayed = queryClient.getQueryData<Row[]>(['/agents'])!;
      expect(displayed).toEqual([c, a, b]);
      const second = getHook().reorderIndex(displayed, 2, 0);
      write.reject(new Error('write failed'));
      expect(await Promise.all([first, second])).toEqual([false, false]);
    });
    expect(dataApi.patch).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(['/agents'])).toEqual(initial);
    await act(async () => {
      expect(await getHook().reorder(initial, [b, a, c])).toBe(true);
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

  it('updates matching caches before an idle reorder returns and restores them if the write fails', async () => {
    const [a, b] = ['a', 'b'].map((id) => ({ id, name: id }));
    const initial = [a, b];
    const next = [b, a];
    const counted = { items: initial, page: 1, total: 2 };
    const flatKey = ['/agents'];
    const countedKey = ['/agents', { limit: 100 }];
    queryClient.setQueryData(flatKey, initial);
    queryClient.setQueryData(countedKey, counted);
    dataApi.patch.mockRejectedValueOnce(new Error('write failed'));
    const getHook = renderHookHarness<Row>({
      getId: (item) => item.id,
      queryFilters: [dataApiCollectionFilters('/agents'), { exact: true, queryKey: countedKey }],
      resource: '/agents',
    });

    let immediate: unknown[] = [];
    await act(async () => {
      const result = getHook().reorder(initial, next);
      immediate = [queryClient.getQueryData(flatKey), queryClient.getQueryData(countedKey)];
      await expect(result).resolves.toBe(false);
    });

    expect(immediate).toEqual([next, { ...counted, items: next }]);
    expect(queryClient.getQueryData(flatKey)).toEqual(initial);
    expect(queryClient.getQueryData(countedKey)).toEqual(counted);
  });

  it('unwinds overlapping filter snapshots in reverse order when a queued reorder fails', async () => {
    const [a, b] = ['a', 'b'].map((id) => ({ id, name: id }));
    const initial = [a, b];
    const afterFirst = [b, a];
    const countedInitial = { items: initial, page: 1, total: 2 };
    const countedAfterFirst = { items: afterFirst, page: 1, total: 2 };
    const flatKey = ['/agents'];
    const countedKey = ['/agents', { limit: 100 }];
    queryClient.setQueryData(flatKey, initial);
    queryClient.setQueryData(countedKey, countedInitial);

    const firstStarted = Promise.withResolvers<void>();
    const firstWrite = Promise.withResolvers<void>();
    dataApi.patch
      .mockImplementationOnce(() => {
        firstStarted.resolve();
        return firstWrite.promise as never;
      })
      .mockRejectedValueOnce(new Error('queued write failed'));

    const onError = jest.fn();
    const getHook = renderHookHarness<Row>({
      getId: (item) => item.id,
      onError,
      queryFilters: [dataApiCollectionFilters('/agents'), { exact: true, queryKey: countedKey }],
      resource: '/agents',
    });

    await act(async () => {
      const first = getHook().reorder(initial, afterFirst);
      await firstStarted.promise;
      // Second reorder enters the queued (non-idle) branch while the first write is in flight.
      const second = getHook().reorder(afterFirst, initial);
      firstWrite.resolve();
      expect(await Promise.all([first, second])).toEqual([true, false]);
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(flatKey)).toEqual(afterFirst);
    expect(queryClient.getQueryData(countedKey)).toEqual(countedAfterFirst);
  });
});
