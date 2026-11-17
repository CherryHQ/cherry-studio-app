import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/frontend/data';

/**
 * Refresh management/detail queries, enabled-model checks, and the cross-provider picker.
 * Prefix predicates cover concrete detail paths, which do not share the list query key.
 */
export async function refreshProviderModelQueries(
  queryClient: QueryClient,
  providerId: string,
  {
    refreshAgents = true,
    throwOnError = false,
  }: { refreshAgents?: boolean; throwOnError?: boolean } = {},
) {
  const refreshes = [
    queryClient.invalidateQueries(
      {
        predicate: ({ queryKey }) =>
          typeof queryKey[0] === 'string' && queryKey[0].startsWith('/models/'),
      },
      { throwOnError },
    ),
    queryClient.invalidateQueries(
      { queryKey: queryKeys.models.list({ providerId }) },
      { throwOnError },
    ),
    queryClient.invalidateQueries(
      {
        queryKey: queryKeys.models.list({ enabled: true, providerId }),
      },
      { throwOnError },
    ),
    queryClient.invalidateQueries({ queryKey: queryKeys.models.list() }, { throwOnError }),
    ...(refreshAgents ? [refreshAgentQueriesAfterModelRemoval(queryClient)] : []),
  ];
  if (throwOnError) {
    // Reorder admission stays locked until the authoritative list settles, even if an
    // unrelated detail refetch fails first. Existing callers retain Promise.all behavior.
    const results = await Promise.allSettled(refreshes);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  } else {
    await Promise.all(refreshes);
  }
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
