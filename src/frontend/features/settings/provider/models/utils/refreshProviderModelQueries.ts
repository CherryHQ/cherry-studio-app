import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/frontend/data';

/**
 * The three lists a change to one provider's models can show up in: the
 * provider's own tab reads the enabled-only list, the pull preview reads the
 * unfiltered one, and the model picker reads every provider's.
 */
export async function refreshProviderModelQueries(queryClient: QueryClient, providerId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.models.list({ providerId }) }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.models.list({ enabled: true, providerId }),
    }),
    queryClient.invalidateQueries({ queryKey: queryKeys.models.list() }),
    refreshAgentQueriesAfterModelRemoval(queryClient),
  ]);
}

/**
 * A model removal may clear any Agent's model through the database FK. Refetch detail queries,
 * including inactive caches, before the mutation settles so chat cannot briefly submit a deleted
 * model snapshot when that Agent is opened again.
 */
export async function refreshAgentQueriesAfterModelRemoval(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.agents.all() }),
    queryClient.refetchQueries({
      predicate: ({ queryKey }) =>
        typeof queryKey[0] === 'string' && queryKey[0].startsWith('/agents/'),
      type: 'all',
    }),
  ]);
}
