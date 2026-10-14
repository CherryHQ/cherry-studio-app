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

test('removes the waiting banner when only background compaction remains after the answer', async () => {
  mockState.contextStatus = 'compacting';
  await render();
  expect(JSON.stringify(renderer?.toJSON())).toContain('chat.compaction.compacting');

  mockState.contextStatus = 'compacting-background';
  await render();
  expect(renderer?.toJSON()).toBeNull();

  mockState.contextStatus = null;
  await render();
  expect(renderer?.toJSON()).toBeNull();
});

test('background progress does not hide runtime recovery or a terminal compaction failure', async () => {
  mockState.contextStatus = 'compacting-background';
  mockState.status = 'error';
  await render();
  expect(JSON.stringify(renderer?.toJSON())).toContain('chat.runtime.failed');

  mockState.status = 'ready';
  mockState.contextStatus = 'compaction-failed';
  await render();
  expect(JSON.stringify(renderer?.toJSON())).toContain('chat.compaction.failed');
});
