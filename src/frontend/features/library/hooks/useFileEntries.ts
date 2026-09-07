import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { type ResolvedFileEntry, useFileEntryPages } from '@/frontend/hooks/file';
import type { FileEntry } from '@/shared/data/types/file';

import { fileLibraryMinVisibleTiles } from '../utils/constants';

export type FileLibraryFilter = 'all' | 'document' | 'image';
export type FileLibraryEntry = ResolvedFileEntry;

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
  // The chat file picker shares these pages and may have fetched them seconds
  // ago, before an upload landed; a fresh cache must not skip this fetch.
  const query = useFileEntryPages({ enabled, refetchOnMount: 'always' });
  const loadNext = query.loadNext;
  const entries = useMemo(
    () =>
      filter === 'all'
        ? query.entries
        : query.entries.filter((item) => entryKind(item.entry) === filter),
    [filter, query.entries],
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
    isLoading: query.isLoading,
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
 * never through a DataApi mutation this cache could invalidate. While the
 * library stays mounted under a screen pushed above it, the user can create
 * those files there; regaining focus is the moment it learns about them.
 */
function useRefreshOnRefocus(refresh: () => void, enabled: boolean) {
  const refreshRef = useRef(refresh);
  // The mounting fetch always runs, so the first focus has nothing to refresh.
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
