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
    waitForSettled = false,
  }: { refreshAgents?: boolean; throwOnError?: boolean; waitForSettled?: boolean } = {},
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
  const refresh: Promise<unknown> = throwOnError
    ? Promise.allSettled(refreshes).then((results) => {
        const failure = results.find((result) => result.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
      })
    : Promise.all(refreshes);
  if (!waitForSettled) {
    await refresh;
    return;
  }
  // Invalidation promises can reject before sibling queries finish. Reorder must also wait
  // for the provider list prefix itself to settle, but a hung refresh must not trap the UI.
  await waitForProviderModelOperation(queryClient, providerId, refresh, true);
}

/** Bound reorder reads and refreshes without cancelling the screen's independent queries. */
export async function waitForProviderModelOperation<T>(
  queryClient: QueryClient,
  providerId: string,
  operation: Promise<T>,
  waitForIdle = false,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cache = queryClient.getQueryCache();
    let result: PromiseSettledResult<T> | undefined;
    const finish = (outcome: PromiseSettledResult<T>) => {
      clearTimeout(timer);
      unsubscribe();
      if (outcome.status === 'rejected') reject(outcome.reason);
      else resolve(outcome.value);
    };
    const fail = () =>
      finish({ status: 'rejected', reason: new Error('Model operation did not settle') });
    const check = () => {
      const queries = cache.findAll({ queryKey: queryKeys.models.list({ providerId }) });
      if (queries.some((query) => query.state.fetchStatus === 'paused')) {
        fail();
        return;
      }
      if (
        !result ||
        (waitForIdle && queries.some((query) => query.state.fetchStatus === 'fetching'))
      )
        return;
      finish(result);
    };
    const unsubscribe = cache.subscribe(check);
    const timer = setTimeout(fail, 10_000);
    void operation.then(
      (value) => {
        result = { status: 'fulfilled', value };
        check();
      },
      (reason: unknown) => {
        result = { status: 'rejected', reason };
        check();
      },
    );
    check();
  });
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
