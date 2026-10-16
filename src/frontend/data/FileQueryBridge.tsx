import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useBackendModule } from './BackendProvider';
import { queryKeys } from './queryKeys';

/** Refresh file reads and dependent painting projections after committed changes. */
export function FileQueryBridge() {
  const file = useBackendModule('file');
  const queryClient = useQueryClient();

  useEffect(
    () =>
      file.subscribeChanges((entryId) => {
        const listPath = queryKeys.files.entries()[0];
        const detailPath = `${listPath}/${entryId}`;
        void queryClient.invalidateQueries({
          predicate: ({ queryKey: [resource, idOrKind, entries], meta }) =>
            resource === listPath ||
            resource === detailPath ||
            (Array.isArray(meta?.fileEntryIds) && meta.fileEntryIds.includes(entryId)) ||
            (resource === 'files' &&
              (idOrKind === entryId ||
                (idOrKind === 'preview-uri-page' &&
                  Array.isArray(entries) &&
                  entries.some((entry) => entry.id === entryId)))),
        });
      }),
    [file, queryClient],
  );

  return null;
}
