import { Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { Agent } from '@/shared/data/types/agent';

import { MainHeader } from '../MainHeader';
import { MainHeaderAgentLabel, useMainHeaderAgent } from '../MainHeaderAgentLabel';
import { MainHeaderAgentPickerSheet } from '../MainHeaderAgentPickerSheet';

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

jest.mock('@/frontend/components/Avatar', () => ({
  AgentAvatar: () => null,
}));

jest.mock('@/frontend/appShell/navigation/chat', () => ({
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

jest.mock('@/frontend/appShell/conversation', () => ({
  ConversationSourceBoundary: ({ children }: { children: React.ReactNode }) => children,
  useConversationAgents: () => ({ items: mockAgent ? [mockAgent] : [], isLoading: false }),
}));

jest.mock('@/frontend/hooks/agent', () => ({
  useAgentsApi: () => ({ agents: mockAgent ? [mockAgent] : [], isLoading: false }),
  useAgentApiById: (agentId: string | undefined) => ({
    agent: agentId === mockAgent?.id ? mockAgent : undefined,
  }),
  useAgentSession: () => ({
    data: mockSessionAgentId ? { agentId: mockSessionAgentId } : undefined,
  }),
}));

jest.mock('../MainHeaderView/MainHeaderView', () => ({
  MainHeaderView: ({ agent, onAgentPress }: { agent?: Agent; onAgentPress?: () => void }) => {
    const { MainHeaderAgentLabel } = jest.requireActual('../MainHeaderAgentLabel');
    return agent ? <MainHeaderAgentLabel agent={agent} onPress={onAgentPress} /> : null;
  },
}));

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  const Button = Object.assign((props: object) => createElement('Button', props), {
    Label: ({ children }: { children: React.ReactNode }) => children,
  });
  return {
    BottomSheet: ({
      open,
      children,
      footer,
    }: {
      open: boolean;
      children: React.ReactNode;
      footer: React.ReactNode;
    }) =>
      open ? (
        <>
          {children}
          {footer}
        </>
      ) : null,
    Button,
    ContentState: { Loading: () => null, Error: () => null, Empty: () => null },
  };
});

function Harness() {
  const { agent } = useMainHeaderAgent();

  return agent ? <MainHeaderAgentLabel agent={agent} /> : null;
}

function NewSessionHarness() {
  const { openNewSession } = useMainHeaderAgent();

  return <Pressable onPress={openNewSession} testID="new-session-button" />;
}

function makeAgent(): Agent {
  return { id: 'agent-1', name: 'Peanut' } as Agent;
}

describe('MainHeaderAgentLabel', () => {
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

  it('uses the route Agent before a Session exists', async () => {
    mockAgentId = 'agent-1';
    mockSessionAgentId = undefined;
    mockSessionId = undefined;

    await act(async () => {
      renderer = create(<Harness />);
    });

    const label = renderer?.root.findByProps({ testID: 'current-agent-label' });
    expect(label?.props.accessibilityLabel).toBe('Peanut');
    expect(label?.props.accessibilityRole).toBe('text');
    expect(label?.props.onPress).toBeUndefined();
  });

  it.each(['edit', 'switch', 'create'] as const)(
    'opens the local header picker and lets the user %s an Agent',
    async (action) => {
      await act(async () => {
        renderer = create(<MainHeader blurTarget={{ current: null }} />);
      });
      expect(renderer!.root.findAllByProps({ accessibilityRole: 'radio' })).toHaveLength(0);
      await act(async () =>
        renderer!.root.findByProps({ testID: 'current-agent-label' }).props.onPress(),
      );
      if (action === 'edit') {
        await act(async () =>
          renderer!.root.findByProps({ accessibilityLabel: 'common.edit: Peanut' }).props.onPress(),
        );
        expect(mockPush).toHaveBeenCalledWith({
          pathname: '/agents/[agentId]/edit',
          params: { agentId: 'agent-1' },
        });
      } else if (action === 'switch') {
        await act(async () =>
          renderer!.root.findByProps({ accessibilityRole: 'radio' }).props.onPress(),
        );
        expect(mockSetParams).toHaveBeenCalledWith({ agentId: 'agent-1', sessionId: undefined });
      } else {
        await act(async () => renderer!.root.findByType('Button').props.onPress());
        expect(mockPush).toHaveBeenCalledWith({
          pathname: '/agents/new',
          params: { startChat: 'true' },
        });
      }
      expect(renderer!.root.findAllByProps({ accessibilityRole: 'radio' })).toHaveLength(0);
    },
  );

  it('selects from a remote catalog without local edit/create actions or a false missing-model label', async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const fetchNextPage = jest.fn();
    const catalog = {
      items: [
        { id: 'remote', ref: 'remote-ref', name: 'Remote', emoji: '🤖', configuration: 'unknown' },
      ],
      hasNextPage: true,
      fetchNextPage,
    } as unknown as React.ComponentProps<typeof MainHeaderAgentPickerSheet>['catalog'];
    await act(async () => {
      renderer = create(
        <MainHeaderAgentPickerSheet
          catalog={catalog}
          currentAgentId="remote"
          open
          onClose={onClose}
          onSelect={onSelect}
        />,
      );
    });
    const option = renderer!.root.findByProps({ accessibilityRole: 'radio' });
    expect(option.props.accessibilityState.checked).toBe(true);
    expect(
      renderer!.root.findAllByProps({ accessibilityLabel: 'common.edit: Remote' }),
    ).toHaveLength(0);
    expect(JSON.stringify(renderer!.toJSON())).not.toContain('agent.model.none');
    // Only the pagination button exists; remote management is not invented.
    await act(async () => renderer!.root.findByType('Button').props.onPress());
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
    await act(async () => option.props.onPress());
    expect(onSelect).toHaveBeenCalledWith('remote');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockSetParams).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('waits for the Session entity to resolve its Agent', async () => {
    mockSessionAgentId = undefined;

    await act(async () => {
      renderer = create(<Harness />);
    });

    expect(renderer?.root.findAllByProps({ testID: 'current-agent-label' })).toHaveLength(0);
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
