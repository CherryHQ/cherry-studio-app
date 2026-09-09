import { useCallback, useEffect, useRef, useState } from 'react';

import type { AppSearchGroup, AppSearchPage, AppSearchRequest } from '@/frontend/appShell/search';

type SearchPhase = 'idle' | 'loading' | 'ready' | 'error';
type StoredSearchRequest = AppSearchRequest<unknown, unknown, unknown>;

/** Owns debounce, cancellation and independent group continuations for the search route. */
export function useAppSearchResults(request: StoredSearchRequest) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(() => request.filter?.initialValue);
  const [groups, setGroups] = useState<readonly AppSearchGroup<unknown>[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [phase, setPhase] = useState<SearchPhase>(request.loadRecent ? 'loading' : 'idle');
  const [loadingGroupKey, setLoadingGroupKey] = useState<string | null>();
  const [reloadVersion, setReloadVersion] = useState(0);
  const requestNumberRef = useRef(0);
  const searchAbortRef = useRef<AbortController | null>(null);
  const paginationAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const searchQuery = query.trim();
    const loadPage = searchQuery ? request.search : request.loadRecent;
    if (!loadPage) return;

    const requestNumber = ++requestNumberRef.current;
    const controller = new AbortController();
    searchAbortRef.current = controller;
    const input = { filters, query: searchQuery, signal: controller.signal };
    const load = () => {
      void Promise.resolve()
        .then(() => {
          controller.signal.throwIfAborted();
          return loadPage(input);
        })
        .then(
          (page) => {
            if (controller.signal.aborted || requestNumber !== requestNumberRef.current) return;
            setGroups(page.groups);
            setNextCursor(page.nextCursor);
            setPhase('ready');
          },
          () => {
            if (controller.signal.aborted || requestNumber !== requestNumberRef.current) return;
            setGroups([]);
            setNextCursor(undefined);
            setPhase('error');
          },
        );
    };
    const delay = searchQuery ? (request.debounceMs ?? 0) : 0;
    const timeout = delay > 0 ? setTimeout(load, delay) : undefined;
    if (delay <= 0) load();
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [filters, query, reloadVersion, request]);

  const resetResults = useCallback(() => {
    searchAbortRef.current?.abort();
    paginationAbortRef.current?.abort();
    paginationAbortRef.current = null;
    requestNumberRef.current += 1;
    setGroups([]);
    setNextCursor(undefined);
    setLoadingGroupKey(undefined);
  }, []);
  useEffect(
    () => () => {
      searchAbortRef.current?.abort();
      paginationAbortRef.current?.abort();
      paginationAbortRef.current = null;
    },
    [],
  );

  const changeQuery = useCallback(
    (value: string) => {
      if (value === query) return;
      resetResults();
      setQuery(value);
      setPhase(value.trim() || request.loadRecent ? 'loading' : 'idle');
    },
    [query, request.loadRecent, resetResults],
  );
  const changeFilters = useCallback(
    (value: unknown) => {
      if (Object.is(value, filters)) return;
      resetResults();
      setFilters(value);
      setPhase(query.trim() || request.loadRecent ? 'loading' : 'idle');
    },
    [filters, query, request.loadRecent, resetResults],
  );

  const loadMore = useCallback(
    (groupKey?: string) => {
      const searchQuery = query.trim();
      const loadPage = searchQuery ? request.search : request.loadRecent;
      const cursor =
        groupKey === undefined
          ? nextCursor
          : groups.find((group) => group.key === groupKey)?.nextCursor;
      if (!loadPage || !cursor || paginationAbortRef.current || phase !== 'ready') return;

      const requestNumber = requestNumberRef.current;
      const controller = new AbortController();
      paginationAbortRef.current = controller;
      setLoadingGroupKey(groupKey ?? null);
      const input = { cursor, filters, groupKey, query: searchQuery, signal: controller.signal };
      void Promise.resolve()
        .then(() => {
          controller.signal.throwIfAborted();
          return loadPage(input);
        })
        .then(
          (page) => {
            if (controller.signal.aborted || requestNumber !== requestNumberRef.current) return;
            setGroups((current) => mergeSearchGroups(current, page, request.keyExtractor));
            if (groupKey === undefined) setNextCursor(page.nextCursor);
          },
          () => {
            // Keep the continuation available so its button can retry the same page.
          },
        )
        .finally(() => {
          if (paginationAbortRef.current === controller) {
            paginationAbortRef.current = null;
            setLoadingGroupKey(undefined);
          }
        });
    },
    [filters, groups, nextCursor, phase, query, request],
  );
  const retry = useCallback(() => {
    resetResults();
    setPhase('loading');
    setReloadVersion((current) => current + 1);
  }, [resetResults]);

  return {
    changeFilters,
    changeQuery,
    filters,
    groups,
    loadingGroupKey,
    loadMore,
    phase,
    query,
    retry,
  };
}

function mergeSearchGroups(
  currentGroups: readonly AppSearchGroup<unknown>[],
  page: AppSearchPage<unknown>,
  keyExtractor: (item: unknown) => string,
): readonly AppSearchGroup<unknown>[] {
  const pageGroups = new Map(page.groups.map((group) => [group.key, group]));
  const mergedGroups = currentGroups.map((group) => {
    const incoming = pageGroups.get(group.key);
    if (!incoming) return group;
    pageGroups.delete(group.key);
    const existingKeys = new Set(group.items.map(keyExtractor));
    return {
      ...group,
      items: [
        ...group.items,
        ...incoming.items.filter((item) => !existingKeys.has(keyExtractor(item))),
      ],
      nextCursor: incoming.nextCursor,
      title: incoming.title ?? group.title,
    };
  });
  return [...mergedGroups, ...pageGroups.values()];
}
