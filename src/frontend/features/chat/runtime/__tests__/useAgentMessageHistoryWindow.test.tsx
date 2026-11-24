import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { queryKeys } from '@/frontend/data';
import type { AgentMessageView } from '@/shared/contracts/agent';

import { useAgentMessageHistoryWindow } from '../useAgentMessageHistoryWindow';

const mockGet = jest.fn(async (): Promise<{ items: AgentMessageView[] }> => ({ items: [] }));
jest.mock('@/frontend/data', () => ({
  ...jest.requireActual('@/frontend/data'),
  useApiClient: () => ({ get: mockGet }),
}));

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('useAgentMessageHistoryWindow', () => {
  let queryClient: QueryClient;
  let renderer: ReactTestRenderer;
  beforeEach(() => mockGet.mockClear());
  afterEach(() => {
    act(() => renderer.unmount());
    queryClient.clear();
  });

  test('retries branch preparation after failure instead of marking it prepared', async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const prepareAround = jest
      .fn()
      .mockRejectedValueOnce(new Error('branch failed'))
      .mockResolvedValue(undefined);
    let window!: ReturnType<typeof useAgentMessageHistoryWindow>;
    function Probe() {
      const currentWindow = useAgentMessageHistoryWindow(
        'retry-session',
        { messageId: 'source' },
        { prepareAround },
      );
      useLayoutEffect(() => {
        window = currentWindow;
      });
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
    expect(window.error).toBeDefined();
    await act(async () => {
      await window.retry();
    });
    expect(prepareAround).toHaveBeenCalledTimes(2);
  });

  test('never installs a prepared exact window whose only match is an ancestor', async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let window!: ReturnType<typeof useAgentMessageHistoryWindow>;
    const ancestor: AgentMessageView = {
      id: 'ancestor',
      sessionId: 'exact-session',
      turnId: null,
      role: 'user',
      status: 'success',
      parts: [],
      stats: null,
      modelId: null,
      inferenceSnapshot: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    function Probe() {
      const current = useAgentMessageHistoryWindow('exact-session', {
        messageId: 'source',
        aroundMode: 'exact',
        preparedPage: { items: [ancestor] },
      });
      useLayoutEffect(() => {
        window = current;
      });
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
    expect(window.messages).toEqual([]);
    expect(window.error).toBeDefined();
    expect(mockGet).toHaveBeenCalledWith(
      '/agent-sessions/exact-session/messages',
      expect.objectContaining({
        query: expect.objectContaining({ aroundMessageId: 'source', aroundMode: 'exact' }),
      }),
    );
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

  test('counts hidden loaded user turns separately from unfetched older pages', async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const makeMessage = (index: number): AgentMessageView => ({
      id: `m-${index}`,
      sessionId: 'three-turn-session',
      turnId: `t-${Math.floor(index / 2)}`,
      role: index % 2 === 0 ? 'user' : 'assistant',
      status: 'success',
      parts: [],
      stats: null,
      modelId: null,
      inferenceSnapshot: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    // API returns newest-first pages; 6 messages = 3 turns with no older page cursor.
    mockGet.mockResolvedValueOnce({
      items: [5, 4, 3, 2, 1, 0].map(makeMessage),
    });

    let window!: ReturnType<typeof useAgentMessageHistoryWindow>;
    function Probe() {
      const current = useAgentMessageHistoryWindow('three-turn-session');
      useLayoutEffect(() => {
        window = current;
      });
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

    expect(window.messages).toHaveLength(4);
    expect(window.hasOlderMessages).toBe(true);
    expect(window.hasUnfetchedOlderMessages).toBe(false);
    expect(window.hiddenUserTurnCount).toBe(1);

    await act(async () => {
      await window.loadOlder();
    });
    await act(settle);

    expect(window.messages).toHaveLength(6);
    expect(window.hasOlderMessages).toBe(false);
    expect(window.hasUnfetchedOlderMessages).toBe(false);
    expect(window.hiddenUserTurnCount).toBe(0);
  });
});
