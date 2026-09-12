import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useBackendModule } from './BackendProvider';
import { queryKeys } from './queryKeys';

/** Refresh lists and the changed file's detail/content, including background draft edits. */
export function FileQueryBridge() {
  const file = useBackendModule('file');
  const queryClient = useQueryClient();

  useEffect(
    () =>
      file.subscribeChanges((entryId) => {
        const listPath = queryKeys.files.entries()[0];
        const detailPath = `${listPath}/${entryId}`;
        void queryClient.invalidateQueries({
          predicate: ({ queryKey: [resource, idOrKind, entries] }) =>
            resource === listPath ||
            resource === detailPath ||
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
