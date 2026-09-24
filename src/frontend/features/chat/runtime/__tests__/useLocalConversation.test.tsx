import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AgentMessageView } from '@/shared/contracts/agent';

import type { AgentSessionChatState } from '../AgentSessionChatClient';
import type { AgentMessageHistoryWindow } from '../useAgentMessageHistoryWindow';
import { useLocalConversation } from '../useLocalConversation';

const mockReconcile = jest.fn();
const mockClient = {
  getState: (): AgentSessionChatState => mockState,
  reconcilePersistedMessages: mockReconcile,
  cancelTurn: jest.fn(),
  respondApproval: jest.fn(),
  respondQuestion: jest.fn(),
  retryMessage: jest.fn(),
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
  turnId: 'turn',
  status,
  parts: [{ id: `${id}-text`, type: 'text', text: id, state: 'done' }],
  createdAt: '2026-09-24T00:00:00.000Z',
  updatedAt: '2026-09-24T00:00:00.000Z',
  usage: null,
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
    activeTurn: null,
    liveMessages: [message('live', 'streaming')],
    pendingApprovals: [],
    pendingQuestion: null,
    enteringUserMessageId: 'live',
  };
  mockWindow = {
    dataKey: 'session',
    messages: [message('older'), message('live', 'pending')],
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
  expect(result.messages.map((row) => row.key)).toEqual(['older', 'live']);
  expect(result.messages[1].state).toBe('pending');
  act(() => renderer.update(<Probe />));
  expect(result.messages).toEqual([]);
  expect(result.snapshot.liveMessages).toEqual([]);
  expect(mockReconcile).toHaveBeenCalledTimes(1);
});
