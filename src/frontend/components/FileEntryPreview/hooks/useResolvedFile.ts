import { useQuery } from '@tanstack/react-query';

import { queryKeys, useBackendModule, useQuery as useDataQuery } from '@/frontend/data';
import type { FileEntryId } from '@/shared/data/types/file';

/**
 * Physical URI for a managed entry. Split out from {@link useResolvedFile} so a
 * caller that already holds the entry — a list page, say — resolves only the
 * URI instead of re-reading the row it just rendered from.
 */
export function useFileUri(entryId: FileEntryId, { enabled = true }: { enabled?: boolean } = {}) {
  const file = useBackendModule('file');

  return useQuery({
    enabled,
    queryFn: () => file.getUri(entryId),
    queryKey: queryKeys.files.uri(entryId),
    retry: false,
  });
}

export function useResolvedFile(entryId: FileEntryId) {
  const entryQuery = useDataQuery('/files/entries/:id', {
    params: { id: entryId },
    retry: false,
  });
  const uriQuery = useFileUri(entryId, { enabled: Boolean(entryQuery.data) });
  const data =
    entryQuery.data && uriQuery.data ? { entry: entryQuery.data, uri: uriQuery.data } : null;

  return {
    data,
    isLoading: entryQuery.isLoading || (Boolean(entryQuery.data) && uriQuery.isLoading),
  };
}
