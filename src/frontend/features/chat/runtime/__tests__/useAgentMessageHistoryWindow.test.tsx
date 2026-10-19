import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { queryKeys } from '@/frontend/data';

import { useAgentMessageHistoryWindow } from '../useAgentMessageHistoryWindow';

const mockGet = jest.fn(async () => ({ items: [] }));
jest.mock('@/frontend/data/DataApiProvider', () => ({ useApiClient: () => ({ get: mockGet }) }));

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('useAgentMessageHistoryWindow', () => {
  let queryClient: QueryClient;
  let renderer: ReactTestRenderer;
  afterEach(() => {
    act(() => renderer.unmount());
    queryClient.clear();
  });

  test('prepares a message window once, though preparing refetches it', async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.agentSessions.messages('session') });
    // Selecting a branch changes the transcript, as AgentSessionChatClient.selectMessage does.
    const prepareAround = jest.fn(async () => {
      void invalidate();
    });
    function Probe() {
      useAgentMessageHistoryWindow(
        'session',
        { messageId: 'hit' },
        { settledOnly: true, prepareAround },
      );
      return null;
    }
    await act(async () => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <Probe />
        </QueryClientProvider>,
      );
    });
    await act(settle);
    expect(prepareAround).toHaveBeenCalledTimes(1);

    // A later transcript change, such as choosing another answer, reads again without re-preparing.
    await act(async () => {
      void invalidate();
      await settle();
    });
    expect(prepareAround).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
