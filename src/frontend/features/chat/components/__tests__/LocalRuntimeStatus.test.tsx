import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AgentSessionChatState } from '../../runtime/AgentSessionChatClient';
import { LocalRuntimeStatus } from '../LocalRuntimeStatus';

let mockState: AgentSessionChatState;
jest.mock('../../runtime', () => ({
  useAgentChatClient: () => ({ client: { refresh: jest.fn() } }),
  useAgentSessionState: () => mockState,
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@cherrystudio/ui/components', () => {
  const { Text } = jest.requireActual('react-native');
  return { ContentState: { Error: ({ title }: { title: string }) => <Text>{title}</Text> } };
});

let renderer: ReactTestRenderer | undefined;

async function render() {
  await act(async () => {
    const tree = <LocalRuntimeStatus sessionId="session" />;
    if (renderer) renderer.update(tree);
    else renderer = create(tree);
  });
}

beforeEach(() => {
  mockState = {
    activeTurn: null,
    liveMessages: [],
    pendingApprovals: [],
    pendingQuestion: null,
    sessionId: 'session',
    status: 'ready',
  };
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
});

function activeTurn(isRetrying: boolean): AgentSessionChatState['activeTurn'] {
  return {
    id: 'turn',
    sessionId: 'session',
    status: 'running',
    assistantMessageId: 'assistant',
    error: null,
    isRetrying,
    startedAt: '2026-10-14T00:00:00.000Z',
    endedAt: null,
  };
}

function text() {
  return JSON.stringify(renderer?.toJSON() ?? null);
}

test('shows automatic retry until the next attempt answers', async () => {
  mockState.activeTurn = activeTurn(true);
  await render();
  expect(text()).toContain('chat.runtime.retrying');

  mockState.activeTurn = activeTurn(false);
  await render();
  expect(renderer?.toJSON()).toBeNull();
});

test('waiting for compaction outranks retry, and retry outranks an earlier compaction failure', async () => {
  mockState.activeTurn = activeTurn(true);
  mockState.contextStatus = 'compacting';
  await render();
  expect(text()).toContain('chat.compaction.compacting');

  mockState.contextStatus = 'compaction-failed';
  await render();
  expect(text()).toContain('chat.runtime.retrying');

  mockState.activeTurn = activeTurn(false);
  await render();
  expect(text()).toContain('chat.compaction.failed');
});

test('runtime recovery replaces transient notices', async () => {
  mockState.activeTurn = activeTurn(true);
  mockState.status = 'error';
  await render();
  expect(text()).toContain('chat.runtime.failed');
  expect(text()).not.toContain('chat.runtime.retrying');
});
