import { Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { Agent } from '@/shared/data/types/agent';

import { MainHeaderAgentButton, useMainHeaderAgent } from '../MainHeaderAgentButton';

const mockPush = jest.fn();
const mockSetParams = jest.fn();
let mockAgent: Agent | undefined;
let mockAgentId: string | undefined;
let mockSessionAgentId: string | undefined;
let mockSessionId: string | undefined;

jest.mock('@cherrystudio/app-icons/icons/bot', () => () => null);

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({
    agentId: mockAgentId,
    sessionId: mockSessionId,
  }),
  useRouter: () => ({ push: mockPush, setParams: mockSetParams }),
}));

jest.mock('@/frontend/hooks/agent', () => ({
  useAgentApiById: (agentId: string | undefined) => ({
    agent: agentId === mockAgent?.id ? mockAgent : undefined,
  }),
  useAgentSession: () => ({
    data: mockSessionAgentId ? { agentId: mockSessionAgentId } : undefined,
  }),
}));

jest.mock('../../components/HeaderAction/HeaderIconButton', () => {
  const { Pressable: MockPressable } = jest.requireActual('react-native');

  return { HeaderIconButton: MockPressable };
});

function Harness() {
  const { agent, openAgent } = useMainHeaderAgent();

  return agent ? <MainHeaderAgentButton agent={agent} onPress={openAgent} /> : null;
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
    mockAgentId = undefined;
    mockSessionAgentId = 'agent-1';
    mockSessionId = 'session-1';
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('opens the current Agent editor', async () => {
    await act(async () => {
      renderer = create(<Harness />);
    });

    const button = renderer?.root.findByProps({ testID: 'current-agent-button' });
    await act(async () => button?.props.onPress());

    expect(button?.props.accessibilityLabel).toBe('Peanut');
    expect(mockPush).toHaveBeenCalledWith({
      params: { agentId: 'agent-1' },
      pathname: '/agents/[agentId]/edit',
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

  it('keeps the route Agent while the new Session is loading', async () => {
    mockAgentId = 'agent-1';
    mockSessionAgentId = undefined;

    await act(async () => {
      renderer = create(<Harness />);
    });

    expect(
      renderer?.root.findByProps({ testID: 'current-agent-button' }).props.accessibilityLabel,
    ).toBe('Peanut');
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
});
