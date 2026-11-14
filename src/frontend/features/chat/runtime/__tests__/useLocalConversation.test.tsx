import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AgentMessageView } from '@/shared/contracts/agent';

import type { AgentSessionChatState } from '../AgentSessionChatClient';
import type { AgentMessageHistoryWindow } from '../useAgentMessageHistoryWindow';
import { useLocalConversation } from '../useLocalConversation';

const mockSsh = { getTarget: () => null };
const mockApi = { get: jest.fn() };
jest.mock('@/frontend/data', () => ({
  useBackendModule: () => mockSsh,
  useApiClient: () => mockApi,
}));
jest.mock('@/frontend/hooks/ssh', () => ({ useSshTarget: () => null }));

const mockReconcile = jest.fn();
const mockClient = {
  getState: (): AgentSessionChatState => mockState,
  reconcilePersistedMessages: mockReconcile,
  cancelTurn: jest.fn(),
  respondApproval: jest.fn(),
  respondQuestion: jest.fn(),
  retryMessage: jest.fn(),
  editMessage: jest.fn(),
  forkSession: jest.fn(),
  deleteTurn: jest.fn(),
};
let mockState: AgentSessionChatState;
let mockWindow: AgentMessageHistoryWindow;
jest.mock('../ChatProvider', () => ({
  useAgentChatClient: () => ({ client: mockClient, onSessionChanged: jest.fn() }),
  useAgentSessionState: () => mockState,
}));
jest.mock('../useAgentMessageHistoryWindow', () => ({
  useAgentMessageHistoryWindow: () => mockWindow,
}));

const message = (id: string, status: AgentMessageView['status'] = 'success'): AgentMessageView => ({
  id,
  role: 'assistant',
  sessionId: 'session',
  turnId: `${id}-turn`,
  status,
  parts: [{ id: `${id}-text`, type: 'text', text: id, state: 'done' }],
  createdAt: '2026-09-24T00:00:00.000Z',
  updatedAt: '2026-09-24T00:00:00.000Z',
  stats: null,
  modelId: null,
  inferenceSnapshot: null,
});
let result: ReturnType<typeof useLocalConversation>;
function Probe({ sessionId }: { sessionId?: string }) {
  const value = useLocalConversation({ sessionId, title: 'Title' });
  useEffect(() => {
    result = value;
  }, [value]);
  return null;
}
let renderer: ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  mockState = {
    sessionId: 'session',
    status: 'ready',
    activeTurn: {
      id: 'live-turn',
      sessionId: 'session',
      assistantMessageId: 'live',
      status: 'running',
      startedAt: '2026-09-24T00:00:00.000Z',
      endedAt: null,
      error: null,
    },
    queuedInputs: [],
    liveMessages: [message('live', 'streaming')],
    pendingApprovals: [],
    pendingQuestion: null,
    enteringUserMessageId: 'live',
  };
  mockWindow = {
    dataKey: 'session',
    messages: [message('older')],
    hasNewerMessages: false,
    hasOlderMessages: false,
    isLoadingInitial: false,
    isRefreshing: false,
    isLoadingOlder: false,
    isLoadingNewer: false,
    loadOlder: jest.fn(),
    loadNewer: jest.fn(),
    retry: jest.fn(),
  };
});
afterEach(() => {
  act(() => renderer?.unmount());
});

it('merges live rows over history by id and hands persisted pages back to the client', () => {
  // Persistence may finish before the live observer delivers the terminal message.
  mockWindow.messages = [...mockWindow.messages, message('live')];
  act(() => {
    renderer = create(<Probe sessionId="session" />);
  });
  expect(result.messages.map((row) => [row.key, row.state])).toEqual([
    ['older', 'success'],
    ['live', 'streaming'],
  ]);
  expect(result.messageWindow.messages.map((row) => row.key)).toEqual(['older', 'live']);
  expect(result.snapshot).toMatchObject({
    title: 'Title',
    freshness: { state: 'current' },
    enteringMessageKey: 'live',
    liveMessages: [{ key: 'live' }],
  });
  expect(mockReconcile).toHaveBeenCalledWith('session', mockWindow.messages);
});

it('excludes live rows from an older search window and projects nothing without a Session', () => {
  mockWindow = { ...mockWindow, hasNewerMessages: true };
  act(() => {
    renderer = create(<Probe sessionId="session" />);
  });
  expect(result.messages.map((row) => row.key)).toEqual(['older']);
  act(() => renderer.update(<Probe />));
  expect(result.messages).toEqual([]);
  expect(result.snapshot.liveMessages).toEqual([]);
  expect(mockReconcile).toHaveBeenCalledTimes(1);
});

it('reads earlier citation facts on the selected branch without changing the message window', async () => {
  const tool = (id: string): AgentMessageView => ({
    ...message(id),
    parts: [
      {
        id: `${id}-tool`,
        type: 'dynamic-tool',
        toolName: 'web_search',
        title: 'web_search',
        toolCallId: `${id}-call`,
        toolRef: { source: 'builtin', capabilityId: 'web_search' },
        input: { query: 'source' },
        state: 'output-available',
        output: {
          value: [{ id: 'lookup-1', title: id, url: 'https://example.com', content: 'Source' }],
          artifacts: [],
        },
      },
    ],
  });
  mockApi.get.mockResolvedValueOnce({ items: [tool('later'), message('target'), tool('earlier')] });
  act(() => {
    renderer = create(<Probe sessionId="session" />);
  });
  const windowMessages = result.messageWindow.messages;
  expect(
    await result.messageWindow.readCitations!('target', ['lookup-1'], new AbortController().signal),
  ).toEqual([{ id: 'lookup-1', title: 'earlier', url: 'https://example.com', content: 'Source' }]);
  expect(mockApi.get).toHaveBeenCalledWith(
    '/agent-sessions/session/messages',
    expect.objectContaining({
      query: { aroundMessageId: 'target', aroundMode: 'exact', limit: 200 },
    }),
  );
  expect(result.messageWindow.messages).toBe(windowMessages);
});
