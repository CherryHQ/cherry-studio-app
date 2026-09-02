import { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/frontend/data';

import { refreshAgentQueriesAfterModelRemoval } from '../refreshProviderModelQueries';

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
  });
});
