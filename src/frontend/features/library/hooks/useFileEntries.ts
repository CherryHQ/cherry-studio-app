import { useCallback, useEffect, useMemo } from 'react';

import { fileEntryPreviewKind } from '@/frontend/components/FileEntryPreview';
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
  const query = useFileEntryPages({ enabled });
  const loadNext = query.loadNext;
  const entries = useMemo(
    () =>
      filter === 'all'
        ? query.entries
        : query.entries.filter((item) => entryKind(item.entry) === filter),
    [filter, query.entries],
  );

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
  return fileEntryPreviewKind(entry) === 'image' ? 'image' : 'document';
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
