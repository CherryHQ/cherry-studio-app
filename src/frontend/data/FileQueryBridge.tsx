import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useBackendModule } from './BackendProvider';
import { useApiClient } from './DataApiProvider';
import { queryKeys } from './queryKeys';

/** Refresh file reads and dependent painting projections after committed changes. */
export function FileQueryBridge() {
  const file = useBackendModule('file');
  const queryClient = useQueryClient();
  const api = useApiClient();

  useEffect(() => {
    const invalidate = (entryId: string) => {
      const listPath = queryKeys.files.entries()[0];
      const detailPath = `${listPath}/${entryId}`;
      void queryClient.invalidateQueries({
        predicate: ({ queryKey: [resource, idOrKind, entries], meta }) =>
          resource === '/files/library' ||
          resource === listPath ||
          resource === detailPath ||
          (Array.isArray(meta?.fileEntryIds) && meta.fileEntryIds.includes(entryId)) ||
          (resource === 'files' &&
            (idOrKind === entryId ||
              (idOrKind === 'preview-uri-page' &&
                Array.isArray(entries) &&
                entries.some((entry) => entry.id === entryId)))),
      });
    };
    const unsubscribeFiles = file.subscribeChanges(invalidate);
    const unsubscribeMetadata = api.subscribeChanges?.((paths) => {
      const prefix = '/files/entries/';
      for (const path of paths) if (path.startsWith(prefix)) invalidate(path.slice(prefix.length));
    });
    return () => {
      unsubscribeFiles();
      unsubscribeMetadata?.();
    };
  }, [api, file, queryClient]);

  return null;
}
