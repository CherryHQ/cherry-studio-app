import type { InfiniteData, QueryClient, QueryFilters, QueryKey } from '@tanstack/react-query';

import type { CursorPaginationResponse } from '@/shared/data/api/types';

export type QuerySnapshot<TData> = [QueryKey, TData | undefined][];

export async function updateQueriesOptimistically<TData>(
  queryClient: QueryClient,
  filters: QueryFilters,
  update: (current: TData | undefined) => TData | undefined,
): Promise<QuerySnapshot<TData>> {
  await queryClient.cancelQueries(filters);
  const snapshot = queryClient.getQueriesData<TData>(filters);
  queryClient.setQueriesData<TData>(filters, update);
  return snapshot;
}

export function restoreQuerySnapshot<TData>(
  queryClient: QueryClient,
  snapshot: QuerySnapshot<TData> | undefined,
) {
  for (const [queryKey, data] of snapshot ?? []) {
    queryClient.setQueryData(queryKey, data);
  }
}

export function dataApiCollectionFilters(path: string): QueryFilters {
  return {
    predicate: ({ queryKey }) =>
      queryKey[0] === path &&
      (queryKey.length === 1 ||
        (typeof queryKey[1] === 'object' && queryKey[1] !== null && !Array.isArray(queryKey[1]))),
  };
}

export function removeItemsFromInfiniteData<TItem extends { id: string }, TPageParam = unknown>(
  current: InfiniteData<CursorPaginationResponse<TItem>, TPageParam> | undefined,
  ids: ReadonlySet<string>,
) {
  if (!current || ids.size === 0) {
    return current;
  }

  let changed = false;
  const pages = current.pages.map((page) => {
    const items = page.items.filter((item) => !ids.has(item.id));
    if (items.length === page.items.length) {
      return page;
    }

    changed = true;
    return { ...page, items };
  });

  return changed ? { ...current, pages } : current;
}

export function removeItemsFromCountedList<
  TItem extends { id: string },
  TData extends { items: TItem[]; total: number },
>(current: TData | undefined, ids: ReadonlySet<string>): TData | undefined {
  if (!current || ids.size === 0) {
    return current;
  }

  const items = current.items.filter((item) => !ids.has(item.id));
  if (items.length === current.items.length) {
    return current;
  }

  return {
    ...current,
    items,
    total: Math.max(0, current.total - (current.items.length - items.length)),
  };
}
