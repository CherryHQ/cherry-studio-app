import { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/frontend/data';

import { refreshConversationModelQueriesAfterRemoval } from '../refreshProviderModelQueries';

describe('refreshConversationModelQueriesAfterRemoval', () => {
  test('refetches inactive Agent and Session details before returning without refetching messages', async () => {
    const queryClient = new QueryClient();
    const agentKey = queryKeys.agents.detail('agent-a');
    const sessionKey = queryKeys.agentSessions.detail('session-a');
    const messagesKey = queryKeys.agentSessions.messages('session-a');
    let persistedModel: string | null = 'provider::model-b';
    let messageReads = 0;
    await Promise.all(
      [agentKey, sessionKey].map((queryKey) =>
        queryClient.fetchQuery({
          queryFn: async () => ({ model: persistedModel }),
          queryKey,
        }),
      ),
    );
    await queryClient.fetchQuery({
      queryFn: async () => {
        messageReads += 1;
        return { items: [] };
      },
      queryKey: messagesKey,
    });
    persistedModel = null;

    await refreshConversationModelQueriesAfterRemoval(queryClient);

    expect(queryClient.getQueryData(agentKey)).toEqual({ model: null });
    expect(queryClient.getQueryData(sessionKey)).toEqual({ model: null });
    expect(messageReads).toBe(1);
  });
});
