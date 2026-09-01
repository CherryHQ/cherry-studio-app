import { Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { Agent } from '@/shared/data/types/agent';

import { MainHeaderAgentButton, useMainHeaderAgent } from '../MainHeaderAgentButton';

const mockPush = jest.fn();
const mockSetParams = jest.fn();
const mockStartNewChat = jest.fn();
let mockAgent: Agent | undefined;
let mockAgentId: string | undefined;
let mockSessionAgentId: string | undefined;
let mockSessionId: string | undefined;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({
    agentId: mockAgentId,
    sessionId: mockSessionId,
  }),
  useRouter: () => ({ push: mockPush, setParams: mockSetParams }),
}));

jest.mock('@/frontend/components/navigation/chat', () => ({
  chatRouteParams: (target: { agentId: string; kind: string; sessionId?: string }) => ({
    agentId: target.agentId,
    sessionId: target.kind === 'session' ? target.sessionId : undefined,
  }),
  parseChatRoute: (params: { agentId?: string; sessionId?: string }) =>
    params.sessionId
      ? {
          status: 'ready',
          target: { kind: 'session', sessionId: params.sessionId },
        }
      : params.agentId
        ? { status: 'ready', target: { agentId: params.agentId, kind: 'draft' } }
        : { status: 'empty' },
  useStartNewChat: () => mockStartNewChat,
}));

jest.mock('@/frontend/hooks/agent', () => ({
  useAgentApiById: (agentId: string | undefined) => ({
    agent: agentId === mockAgent?.id ? mockAgent : undefined,
  }),
  useAgentSession: () => ({
    data: mockSessionAgentId ? { agentId: mockSessionAgentId } : undefined,
  }),
}));

function Harness() {
  const { agent } = useMainHeaderAgent();

  return agent ? <MainHeaderAgentButton agent={agent} onPress={jest.fn()} /> : null;
}

function HistoryHarness() {
  const { openAgentHistory } = useMainHeaderAgent();

  return <Pressable onPress={openAgentHistory} testID="history-button" />;
}

function NewSessionHarness() {
  const { openNewSession } = useMainHeaderAgent();

  return <Pressable onPress={openNewSession} testID="new-session-button" />;
}

function makeAgent(): Agent {
  return { id: 'agent-1', name: 'Peanut' } as Agent;
}

describe('MainHeaderAgentButton', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAgent = makeAgent();
    mockAgentId = 'agent-1';
    mockSessionAgentId = 'agent-1';
    mockSessionId = 'session-1';
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('opens the current Agent history', async () => {
    await act(async () => {
      renderer = create(<HistoryHarness />);
    });

    const button = renderer?.root.findByProps({ testID: 'history-button' });
    await act(async () => button?.props.onPress());

    expect(mockPush).toHaveBeenCalledWith({
      params: { agentId: 'agent-1' },
      pathname: '/sessions',
    });
  });

  it('uses the route Agent before a Session exists', async () => {
    mockAgentId = 'agent-1';
    mockSessionAgentId = undefined;
    mockSessionId = undefined;

    await act(async () => {
      renderer = create(<Harness />);
    });

    expect(
      renderer?.root.findByProps({ testID: 'current-agent-button' }).props.accessibilityLabel,
    ).toBe('Peanut');
  });

  it('waits for the Session entity to resolve its Agent', async () => {
    mockSessionAgentId = undefined;

    await act(async () => {
      renderer = create(<Harness />);
    });

    expect(renderer?.root.findAllByProps({ testID: 'current-agent-button' })).toHaveLength(0);
  });

  it('starts a new Session with the current Agent', async () => {
    await act(async () => {
      renderer = create(<NewSessionHarness />);
    });

    const button = renderer?.root.findByProps({ testID: 'new-session-button' });
    await act(async () => button?.props.onPress());

    expect(mockSetParams).toHaveBeenCalledWith({
      agentId: 'agent-1',
      sessionId: undefined,
    });
  });

  it('falls back to another available Agent when the Session Agent was deleted', async () => {
    mockAgent = undefined;

    await act(async () => {
      renderer = create(<NewSessionHarness />);
    });

    const button = renderer?.root.findByProps({ testID: 'new-session-button' });
    await act(async () => button?.props.onPress());

    expect(mockSetParams).not.toHaveBeenCalled();
    expect(mockStartNewChat).toHaveBeenCalledTimes(1);
  });
});
