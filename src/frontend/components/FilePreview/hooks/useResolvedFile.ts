import type { FileEntryId } from '@cherrystudio/universal/data/types/file';
import { useQuery } from '@tanstack/react-query';

import { queryKeys, useBackendModule, useQuery as useDataQuery } from '@/frontend/data';

export function useResolvedFile(entryId: FileEntryId) {
  const file = useBackendModule('file');
  const entryQuery = useDataQuery('/files/entries/:id', {
    params: { id: entryId },
    retry: false,
  });
  const uriQuery = useQuery({
    enabled: Boolean(entryQuery.data),
    queryFn: () => file.resolveUri(entryId),
    queryKey: queryKeys.files.uri(entryId),
    retry: false,
  });
  const data =
    entryQuery.data && uriQuery.data ? { entry: entryQuery.data, uri: uriQuery.data } : null;

  return {
    data,
    isLoading: entryQuery.isLoading || (Boolean(entryQuery.data) && uriQuery.isLoading),
  };
}
