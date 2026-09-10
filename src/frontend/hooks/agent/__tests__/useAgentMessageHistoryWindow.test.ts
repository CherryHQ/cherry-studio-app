import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AgentMessageView } from '@/shared/contracts/agent';
import type {
  AgentSessionMessagePage,
  ListAgentSessionMessagesQueryParams,
} from '@/shared/data/api/schemas/agentSessionMessages';

import {
  __testing,
  type AgentMessageHistoryWindow,
  useAgentMessageHistoryWindow,
} from '../useAgentMessageHistoryWindow';

const mockGet = jest.fn<
  Promise<AgentSessionMessagePage>,
  [string, { query: ListAgentSessionMessagesQueryParams }]
>();
jest.mock('@/frontend/data/DataApiProvider', () => ({
  useApiClient: () => ({ get: mockGet }),
}));
jest.mock('@/frontend/data', () => ({
  queryKeys: {
    agentSessions: { messages: (id: string) => [`/agent-sessions/${id}/messages`] },
  },
}));

function message(id: string): AgentMessageView {
  return {
    createdAt: '2026-08-25T00:00:00.000Z',
    id,
    parts: [],
    role: 'assistant',
    sessionId: 'session-1',
    status: 'success',
    turnId: 'turn-1',
    updatedAt: '2026-08-25T00:00:00.000Z',
    usage: null,
    stats: null,
    modelId: null,
    inferenceSnapshot: null,
  };
}

type ProbeProps = { sessionId: string; messageId?: string; messageRequestId?: string };

describe('Agent Session message history', () => {
  let queryClient: QueryClient;
  let renderer: ReactTestRenderer | undefined;
  let observed: AgentMessageHistoryWindow;

  function Probe({ sessionId, ...navigation }: ProbeProps) {
    observed = useAgentMessageHistoryWindow(sessionId, navigation);
    return null;
  }

  async function render(props: ProbeProps) {
    await act(async () => {
      const element = createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(Probe, props),
      );
      if (renderer) renderer.update(element);
      else renderer = create(element);
    });
  }

  async function settle(predicate: () => boolean) {
    for (let attempt = 0; attempt < 30 && !predicate(); attempt += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
    expect(predicate()).toBe(true);
  }

  beforeEach(() => {
    mockGet.mockReset();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    queryClient.clear();
  });

  test('reverses newest-first pages into one chronological transcript', () => {
    expect(
      __testing.flattenMessagePages([
        { items: [message('4'), message('3')], nextCursor: 'older' },
        { items: [message('2'), message('1')] },
      ]),
    ).toEqual([message('1'), message('2'), message('3'), message('4')]);
  });

  test('shows the complete target window and continues both directions', async () => {
    mockGet.mockResolvedValueOnce({
      items: ['8', '7', '6', '5', '4', '3'].map(message),
      nextCursor: 'older',
      previousCursor: 'newer',
    });
    await render({ sessionId: 'session-a', messageId: '4', messageRequestId: 'visit-1' });
    await settle(() => !observed.isLoadingInitial);
    expect(observed.messages.map((item) => item.id)).toEqual(['3', '4', '5', '6', '7', '8']);
    expect(observed.initialScrollTarget).toEqual({ messageId: '4' });
    expect(observed.hasNewerMessages).toBe(true);
    expect(mockGet).toHaveBeenLastCalledWith('/agent-sessions/session-a/messages', {
      query: { aroundMessageId: '4', limit: 12 },
    });

    mockGet.mockResolvedValueOnce({ items: [message('2'), message('1')] });
    await act(async () => observed.loadOlder());
    await settle(() => observed.messages[0]?.id === '1');
    expect(mockGet).toHaveBeenLastCalledWith('/agent-sessions/session-a/messages', {
      query: { cursor: 'older', direction: 'older', limit: 12 },
    });

    mockGet.mockResolvedValueOnce({ items: [message('10'), message('9')], nextCursor: 'back' });
    await act(async () => observed.loadNewer());
    await settle(() => !observed.hasNewerMessages);
    expect(mockGet).toHaveBeenLastCalledWith('/agent-sessions/session-a/messages', {
      query: { cursor: 'newer', direction: 'newer', limit: 12 },
    });
    expect(observed.messages.map((item) => item.id)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
    ]);
  });

  test('returns to the latest page and lets the same result be selected again', async () => {
    mockGet.mockResolvedValueOnce({ items: [message('target')], previousCursor: 'newer' });
    await render({ sessionId: 'session-a', messageId: 'target', messageRequestId: 'visit-1' });
    await settle(() => !observed.isLoadingInitial);
    const firstKey = observed.dataKey;

    mockGet.mockResolvedValueOnce({ items: [message('latest')] });
    await act(async () => observed.returnToLatest?.());
    await settle(() => observed.messages[0]?.id === 'latest');
    expect(observed.initialScrollTarget).toBe('end');
    expect(observed.returnToLatest).toBeUndefined();

    mockGet.mockResolvedValueOnce({ items: [message('target')], previousCursor: 'newer' });
    await render({ sessionId: 'session-a', messageId: 'target', messageRequestId: 'visit-2' });
    await settle(() => !observed.isLoadingInitial);
    expect(observed.initialScrollTarget).toEqual({ messageId: 'target' });
    expect(observed.dataKey).not.toBe(firstKey);
    expect(observed.messages[0]?.id).toBe('target');
    expect(mockGet).toHaveBeenCalledTimes(3);
  });

  test('does not carry an older-page request into another Session', async () => {
    const older = deferred<AgentSessionMessagePage>();
    mockGet.mockResolvedValueOnce({ items: [message('a')], nextCursor: 'older-a' });
    await render({ sessionId: 'session-a' });
    await settle(() => !observed.isLoadingInitial);

    mockGet.mockReturnValueOnce(older.promise);
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = observed.loadOlder();
      await Promise.resolve();
    });
    await settle(() => observed.isLoadingOlder);

    mockGet.mockResolvedValueOnce({ items: [message('b')] });
    await render({ sessionId: 'session-b' });
    await settle(() => !observed.isLoadingInitial);
    expect(observed.isLoadingOlder).toBe(false);
    expect(observed.messages.map((item) => item.id)).toEqual(['b']);

    older.resolve({ items: [message('older-a')] });
    await act(async () => pending);
    expect(observed.messages.map((item) => item.id)).toEqual(['b']);
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
