import { queryOptions, useQueries } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { queryKeys, useBackendModule, useInfiniteQuery } from '@/frontend/data';
import type { FileEntry } from '@/shared/data/types/file';

const FILE_ENTRY_PAGE_SIZE = 30;

export type ResolvedFileEntry = {
  entry: FileEntry;
  previewUri: string | undefined;
  uri: string | undefined;
};

type FileUriPageResult = {
  data: ResolvedFileEntry[] | undefined;
  error: Error | null;
  isPending: boolean;
  refetch: () => Promise<unknown>;
};

type FilePreviewResult = {
  data: ResolvedFileEntry | undefined;
};

/** Shared cursor pages and batched previews for the library and attachment picker. */
export function useFileEntryPages({
  enabled,
  refetchOnMount,
}: {
  enabled: boolean;
  refetchOnMount?: boolean | 'always';
}) {
  const file = useBackendModule('file');
  const query = useInfiniteQuery('/files/entries', {
    enabled,
    limit: FILE_ENTRY_PAGE_SIZE,
    refetchOnMount,
  });
  const uriPageQueries = useMemo(
    () =>
      query.pages.map((page) =>
        queryOptions({
          enabled,
          queryFn: async (): Promise<ResolvedFileEntry[]> => {
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
    [enabled, file, query.pages],
  );
  const combineUriPages = useCallback((results: readonly FileUriPageResult[]) => {
    return {
      entries: results.flatMap((result) => result.data ?? []),
      failedPages: results.filter((result) => result.error),
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
          enabled: enabled && needsPreview,
          initialData: needsPreview ? undefined : item,
          queryFn: async (): Promise<ResolvedFileEntry> => ({
            ...item,
            previewUri: await file.generatePreviewUri(item.entry),
          }),
          queryKey: queryKeys.files.previewUri(item.entry),
          retry: false,
          staleTime: Infinity,
        });
      }),
    [enabled, file, uriPages.entries],
  );
  const combinePreviews = useCallback(
    (results: readonly FilePreviewResult[]) =>
      results.map((result, index) => result.data ?? uriPages.entries[index]),
    [uriPages.entries],
  );
  const entries = useQueries({ combine: combinePreviews, queries: previewQueries });
  const refreshPages = query.refresh;
  const refresh = useCallback(async () => {
    await Promise.all([refreshPages(), ...uriPages.failedPages.map((page) => page.refetch())]);
  }, [refreshPages, uriPages.failedPages]);

  return {
    entries,
    error: query.error ?? uriPages.failedPages[0]?.error ?? undefined,
    hasNext: query.hasNext,
    isLoading: entries.length === 0 && (!enabled || query.isLoading || uriPages.isPending),
    isLoadingMore: query.isLoadingMore,
    loadNext: query.loadNext,
    refresh,
  };
}
