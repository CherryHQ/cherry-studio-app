import { queryOptions, useQueries } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { queryKeys, useBackendModule, useInfiniteQuery } from '@/frontend/data';
import type { FileEntry } from '@/shared/data/types/file';

import { fileLibraryMinVisibleTiles } from '../utils/constants';

const pageSize = 30;

export type FileLibraryFilter = 'all' | 'document' | 'image';
export type FileLibraryEntry = {
  entry: FileEntry;
  previewUri: string | undefined;
  uri: string | undefined;
};

type FileLibraryUriPageResult = {
  data: FileLibraryEntry[] | undefined;
  isPending: boolean;
};

type FileLibraryPreviewResult = {
  data: FileLibraryEntry | undefined;
};

/**
 * One cursor walk over every file, partitioned by the kind tabs client-side.
 *
 * The tabs are a filter over what is already on screen, not three separate
 * lists: switching them must not re-query, must not blank the grid, and must
 * carry the pages the previous tab already paged in. That rules out putting the
 * kind in the DataApi query — it would key three independent page stacks that
 * cannot share a thing.
 */
export function useFileEntries(filter: FileLibraryFilter, { enabled }: { enabled: boolean }) {
  const file = useBackendModule('file');
  const query = useInfiniteQuery('/files/entries', { enabled, limit: pageSize });
  const loadNext = query.loadNext;
  const uriPageQueries = useMemo(
    () =>
      query.pages.map((page) =>
        queryOptions({
          queryFn: async (): Promise<FileLibraryEntry[]> => {
            const uris = await file.resolveUris(page.items);
            return page.items.map((entry, index) => ({
              entry,
              previewUri: uris[index]?.previewUri,
              uri: uris[index]?.uri,
            }));
          },
          queryKey: queryKeys.files.previewUriPage(page.items),
          retry: false,
          staleTime: Infinity,
        }),
      ),
    [file, query.pages],
  );
  const combineUriPages = useCallback((results: readonly FileLibraryUriPageResult[]) => {
    return {
      entries: results.flatMap((result) => result.data ?? []),
      isPending: results.some((result) => result.isPending),
    };
  }, []);
  const uriPages = useQueries({ combine: combineUriPages, queries: uriPageQueries });
  const previewQueries = useMemo(
    () =>
      uriPages.entries.map((item) => {
        const needsPreview =
          Boolean(item.uri) && item.entry.mediaType.startsWith('image/') && !item.previewUri;
        return queryOptions({
          enabled: needsPreview,
          initialData: needsPreview ? undefined : item,
          queryFn: async (): Promise<FileLibraryEntry> => ({
            ...item,
            previewUri: await file.generatePreviewUri(item.entry),
          }),
          queryKey: queryKeys.files.previewUri(item.entry),
          retry: false,
          staleTime: Infinity,
        });
      }),
    [file, uriPages.entries],
  );
  const combinePreviews = useCallback(
    (results: readonly FileLibraryPreviewResult[]) =>
      results.map((result, index) => result.data ?? uriPages.entries[index]),
    [uriPages.entries],
  );
  const resolvedEntries = useQueries({ combine: combinePreviews, queries: previewQueries });
  const entries = useMemo(
    () =>
      filter === 'all'
        ? resolvedEntries
        : resolvedEntries.filter((item) => entryKind(item.entry) === filter),
    [filter, resolvedEntries],
  );

  useRefreshOnRefocus(query.refresh, enabled);
  useFillViewport({
    enabled,
    hasNext: query.hasNext,
    isLoadingMore: query.isLoadingMore,
    loadNext,
    visibleCount: entries.length,
  });
  const loadMore = useCallback(() => {
    if (enabled) {
      void loadNext();
    }
  }, [enabled, loadNext]);

  return {
    entries,
    isLoading: uriPages.entries.length === 0 && (!enabled || query.isLoading || uriPages.isPending),
    isLoadingMore: query.isLoadingMore,
    loadMore,
  };
}

/** Image is the only positive class; a document is everything else. */
function entryKind(entry: FileEntry): FileLibraryFilter {
  return entry.mediaType.startsWith('image/') ? 'image' : 'document';
}

/**
 * A sparse kind — three documents among a thousand images — would otherwise
 * show a near-empty tab that only fills as the user scrolls a list with nothing
 * in it to scroll. Pages are pulled one at a time until the tab has enough to
 * cover a screen or the stream runs out, and each page reaching the filter is
 * what re-arms this.
 */
function useFillViewport({
  enabled,
  hasNext,
  isLoadingMore,
  loadNext,
  visibleCount,
}: {
  enabled: boolean;
  hasNext: boolean;
  isLoadingMore: boolean;
  loadNext: () => void;
  visibleCount: number;
}) {
  useEffect(() => {
    if (enabled && visibleCount < fileLibraryMinVisibleTiles && hasNext && !isLoadingMore) {
      loadNext();
    }
  }, [enabled, hasNext, isLoadingMore, loadNext, visibleCount]);
}

/**
 * Files are written by the backend during chat attachment and image generation,
 * never through a DataApi mutation this cache could invalidate. The library is
 * also a drawer scene, so it stays mounted while the user goes and creates
 * those files elsewhere and never remounts to refetch. Re-focus is the one
 * moment it can learn about them.
 */
function useRefreshOnRefocus(refresh: () => void, enabled: boolean) {
  const refreshRef = useRef(refresh);
  // The mounting fetch already ran, so the first focus has nothing to refresh.
  const hasFocusedRef = useRef(false);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) {
        return;
      }
      if (hasFocusedRef.current) {
        refreshRef.current();
      } else {
        hasFocusedRef.current = true;
      }
    }, [enabled]),
  );
}
