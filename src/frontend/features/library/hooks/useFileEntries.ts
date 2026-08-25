import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useInfiniteQuery } from '@/frontend/data';
import type { FileEntry } from '@/shared/data/types/file';

import { fileLibraryMinVisibleTiles } from '../utils/constants';

const pageSize = 30;

export type FileLibraryFilter = 'all' | 'document' | 'image';

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
  const query = useInfiniteQuery('/files/entries', { enabled, limit: pageSize });
  const loadNext = query.loadNext;
  const loaded = useMemo(() => query.pages.flatMap((page) => page.items), [query.pages]);
  const entries = useMemo(
    () => (filter === 'all' ? loaded : loaded.filter((entry) => entryKind(entry) === filter)),
    [filter, loaded],
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
    isLoading: loaded.length === 0 && (!enabled || query.isLoading),
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
