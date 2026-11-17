import { QueryClient, QueryObserver } from '@tanstack/react-query';

import { queryKeys } from '@/frontend/data';

import {
  refreshAgentQueriesAfterModelRemoval,
  refreshProviderModelQueries,
} from '../refreshProviderModelQueries';

describe('refreshAgentQueriesAfterModelRemoval', () => {
  test('refetches inactive Agent details before returning', async () => {
    const queryClient = new QueryClient();
    const detailKey = queryKeys.agents.detail('agent-a');
    let persistedModelId: string | null = 'provider::model-b';
    await queryClient.fetchQuery({
      queryFn: async () => ({ modelId: persistedModelId }),
      queryKey: detailKey,
    });
    persistedModelId = null;

    await refreshAgentQueriesAfterModelRemoval(queryClient);

    expect(queryClient.getQueryData(detailKey)).toEqual({ modelId: null });
    queryClient.clear();
  });
});

describe('refreshProviderModelQueries for reorder', () => {
  test('waits for the provider list after an unrelated detail refetch fails first', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const listKey = queryKeys.models.list({ providerId: 'p' });
    const detailKey = ['/models/p::A'];
    let refreshing = false;
    let finishList!: (value: string[]) => void;
    let failDetail!: (error: Error) => void;
    const listFn = () =>
      refreshing
        ? new Promise<string[]>((resolve) => {
            finishList = resolve;
          })
        : Promise.resolve(['old']);
    const detailFn = () =>
      refreshing
        ? new Promise<never>((_resolve, reject) => {
            failDetail = reject;
          })
        : Promise.resolve({ id: 'p::A' });
    await Promise.all([
      queryClient.fetchQuery({ queryKey: listKey, queryFn: listFn, staleTime: Infinity }),
      queryClient.fetchQuery({ queryKey: detailKey, queryFn: detailFn, staleTime: Infinity }),
    ]);
    const listObserver = new QueryObserver(queryClient, {
      queryKey: listKey,
      queryFn: listFn,
      staleTime: Infinity,
    });
    const detailObserver = new QueryObserver(queryClient, {
      queryKey: detailKey,
      queryFn: detailFn,
      staleTime: Infinity,
    });
    const unsubscribes = [
      listObserver.subscribe(() => undefined),
      detailObserver.subscribe(() => undefined),
    ];
    refreshing = true;
    let settled = false;
    const failure = new Error('detail refetch failed');
    const result = refreshProviderModelQueries(queryClient, 'p', {
      refreshAgents: false,
      throwOnError: true,
    }).then(
      () => {
        settled = true;
        return undefined;
      },
      (error: unknown) => {
        settled = true;
        return error;
      },
    );
    try {
      failDetail(failure);
      // Flush the rejected invalidation while the authoritative list is still pending.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(queryClient.getQueryState(listKey)?.fetchStatus).toBe('fetching');
      expect(settled).toBe(false);
      finishList(['new']);
      expect(await result).toBe(failure);
      expect(queryClient.getQueryData(listKey)).toEqual(['new']);
      expect(queryClient.getQueryState(listKey)?.fetchStatus).toBe('idle');
    } finally {
      finishList(['new']);
      await result;
      await queryClient.cancelQueries();
      unsubscribes.forEach((unsubscribe) => unsubscribe());
      queryClient.clear();
    }
  });
  test('invalidates models without invalidating Agent caches', async () => {
    const queryClient = new QueryClient();
    const modelKey = queryKeys.models.list({ providerId: 'p' });
    const agentKey = queryKeys.agents.all();
    queryClient.setQueryData(modelKey, []);
    queryClient.setQueryData(agentKey, []);
    await refreshProviderModelQueries(queryClient, 'p', { refreshAgents: false });
    expect(queryClient.getQueryState(modelKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(agentKey)?.isInvalidated).toBe(false);
    queryClient.clear();
  });
  test('can surface an active model refetch failure after a committed reorder', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const queryKey = queryKeys.models.list({ providerId: 'p' });
    let fails = false;
    const queryFn = async () => {
      if (fails) throw new Error('refetch failed');
      return [];
    };
    await queryClient.fetchQuery({ queryKey, queryFn, staleTime: Infinity });
    const observer = new QueryObserver(queryClient, { queryKey, queryFn, staleTime: Infinity });
    const unsubscribe = observer.subscribe(() => undefined);
    fails = true;
    try {
      await expect(
        refreshProviderModelQueries(queryClient, 'p', { refreshAgents: false, throwOnError: true }),
      ).rejects.toThrow('refetch failed');
    } finally {
      unsubscribe();
      queryClient.clear();
    }
  });
});
