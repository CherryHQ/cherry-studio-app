import type { Query, QueryClient } from '@tanstack/react-query';

import type { ApiClient } from '@/shared/data/api/types';

/** Idle metadata has no connection lease to deliver revocation; pairing changes evict it. */
export function subscribeCatalogDirectoryChanges(
  api: Pick<ApiClient, 'subscribeChanges'>,
  queryClient: QueryClient,
) {
  return api.subscribeChanges?.((paths) => {
    if (
      !paths.some(
        (path) => path === '/desktop-connections' || path.startsWith('/desktop-connections/'),
      )
    )
      return;
    const filters = {
      predicate: (query: Query) =>
        query.getObserversCount() === 0 &&
        query.queryKey[0] === 'conversation-catalog' &&
        (query.queryKey[1] as { kind?: string })?.kind === 'desktop',
    };
    void queryClient.cancelQueries(filters);
    queryClient.removeQueries(filters);
  });
}
