import { type InfiniteData, QueryClient } from '@tanstack/react-query';

import type { CursorPaginationResponse } from '@/shared/data/api/types';

import {
  dataApiCollectionFilters,
  removeItemsFromCountedList,
  removeItemsFromInfiniteData,
  restoreQuerySnapshot,
  updateQueriesOptimistically,
} from '../optimisticQueryUpdate';

type Item = { id: string; name: string };

describe('optimistic query updates', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity, retry: false } },
    });
  });

  afterEach(() => queryClient.clear());

  it('updates every infinite list variant without touching details and restores the snapshot', async () => {
    const firstPage = page(item('a'), item('b'));
    const secondPage = page(item('c'));
    const list: InfiniteData<CursorPaginationResponse<Item>, string | undefined> = {
      pageParams: [undefined, 'cursor-2'],
      pages: [firstPage, secondPage],
    };
    queryClient.setQueryData(['/agent-sessions', { limit: 50 }], list);
    queryClient.setQueryData(['/agent-sessions', { agentId: 'agent-1', limit: 50 }], {
      pageParams: [undefined],
      pages: [firstPage],
    });
    queryClient.setQueryData(['/agent-sessions/a'], item('a'));

    const snapshot = await updateQueriesOptimistically<
      InfiniteData<CursorPaginationResponse<Item>, string | undefined>
    >(queryClient, dataApiCollectionFilters('/agent-sessions'), (current) =>
      removeItemsFromInfiniteData(current, new Set(['a'])),
    );

    expect(readInfiniteIds(queryClient.getQueryData(['/agent-sessions', { limit: 50 }]))).toEqual([
      'b',
      'c',
    ]);
    expect(
      readInfiniteIds(
        queryClient.getQueryData(['/agent-sessions', { agentId: 'agent-1', limit: 50 }]),
      ),
    ).toEqual(['b']);
    expect(queryClient.getQueryData(['/agent-sessions/a'])).toEqual(item('a'));

    restoreQuerySnapshot(queryClient, snapshot);
    expect(readInfiniteIds(queryClient.getQueryData(['/agent-sessions', { limit: 50 }]))).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('updates counted lists while excluding derived queries with the same root key', async () => {
    queryClient.setQueryData(['/mcp-servers'], {
      items: [item('a'), item('b')],
      total: 2,
    });
    queryClient.setQueryData(['/mcp-servers', { isEnabled: true }], {
      items: [item('a')],
      total: 1,
    });
    queryClient.setQueryData(['/mcp-servers', 'runtime-summaries'], { a: 'ready' });

    await updateQueriesOptimistically<{ items: Item[]; total: number }>(
      queryClient,
      dataApiCollectionFilters('/mcp-servers'),
      (current) => removeItemsFromCountedList(current, new Set(['a'])),
    );

    expect(queryClient.getQueryData(['/mcp-servers'])).toEqual({
      items: [item('b')],
      total: 1,
    });
    expect(queryClient.getQueryData(['/mcp-servers', { isEnabled: true }])).toEqual({
      items: [],
      total: 0,
    });
    expect(queryClient.getQueryData(['/mcp-servers', 'runtime-summaries'])).toEqual({
      a: 'ready',
    });
  });

  it('restores an exact array query after an optimistic API key removal', async () => {
    const queryKey = ['/providers/provider-1/api-keys'] as const;
    queryClient.setQueryData(queryKey, [item('a'), item('b')]);

    const snapshot = await updateQueriesOptimistically<Item[]>(
      queryClient,
      { exact: true, queryKey },
      (current) => current?.filter((entry) => entry.id !== 'a'),
    );
    expect(queryClient.getQueryData(queryKey)).toEqual([item('b')]);

    restoreQuerySnapshot(queryClient, snapshot);
    expect(queryClient.getQueryData(queryKey)).toEqual([item('a'), item('b')]);
  });
});

function item(id: string): Item {
  return { id, name: id.toUpperCase() };
}

function page(...items: Item[]): CursorPaginationResponse<Item> {
  return { items };
}

function readInfiniteIds(data: unknown): string[] {
  return (data as InfiniteData<CursorPaginationResponse<Item>>).pages.flatMap((entry) =>
    entry.items.map((item) => item.id),
  );
}
