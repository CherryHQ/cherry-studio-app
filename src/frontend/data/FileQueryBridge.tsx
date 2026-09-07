import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useBackendModule } from './BackendProvider';
import { queryKeys } from './queryKeys';

/** Keep every file list current, including writes made without a mounted composer or library. */
export function FileQueryBridge() {
  const file = useBackendModule('file');
  const queryClient = useQueryClient();

  useEffect(
    () =>
      file.subscribeChanges(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.files.entries() });
      }),
    [file, queryClient],
  );

  return null;
}
