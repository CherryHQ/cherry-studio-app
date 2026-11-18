import { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/frontend/data';

import { refreshConversationModelQueriesAfterRemoval } from '../refreshProviderModelQueries';

describe('refreshConversationModelQueriesAfterRemoval', () => {
  test('refetches inactive Agent and Session details before returning', async () => {
    const queryClient = new QueryClient();
    const agentKey = queryKeys.agents.detail('agent-a');
    const sessionKey = queryKeys.agentSessions.detail('session-a');
    let persistedModelId: string | null = 'provider::model-b';
    await Promise.all(
      [agentKey, sessionKey].map((queryKey) =>
        queryClient.fetchQuery({
          queryFn: async () => ({ modelId: persistedModelId }),
          queryKey,
        }),
      ),
    );
    persistedModelId = null;

    await refreshConversationModelQueriesAfterRemoval(queryClient);

    expect(queryClient.getQueryData(agentKey)).toEqual({ modelId: null });
    expect(queryClient.getQueryData(sessionKey)).toEqual({ modelId: null });
  });
});
