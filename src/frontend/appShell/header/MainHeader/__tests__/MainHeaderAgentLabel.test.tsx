import { Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { NavigationShellContext } from '@/frontend/appShell/navigationShell/state';
import { AgentPickerSheet } from '@/frontend/components/AgentPicker';
import type { Agent } from '@/shared/data/types/agent';

import { MainHeader } from '../MainHeader';
import { MainHeaderAgentLabel, useMainHeaderAgent } from '../MainHeaderAgentLabel';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSetParams = jest.fn();
const mockStartNewChat = jest.fn();
const mockOpenLocal = jest.fn();
const mockOpenTeam = jest.fn();
const mockCreateHandoff = jest.fn((_value: unknown) => 'blank-composer');
let mockAgent: Agent | undefined;
let mockAgentId: string | undefined;
let mockSessionAgentId: string | undefined;
let mockSessionId: string | undefined;
let mockChatSource: {
  source: 'local' | 'remote' | 'team';
  openLocal: jest.Mock;
  openTeam: jest.Mock;
} | null = null;
let mockTeamOverlay: {
  agents: {
    id: string;
    name: string;
    groupName?: string;
    source: { kind: 'team'; bindingId: string };
    configuration: 'unknown';
  }[];
  isAgentsLoading?: boolean;
} | null = null;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({
    agentId: mockAgentId,
    sessionId: mockSessionId,
  }),
  useRouter: () => ({ push: mockPush, replace: mockReplace, setParams: mockSetParams }),
}));

jest.mock('@/frontend/components/AgentEditor', () => ({
  AgentEditor: (props: object) => {
    const { createElement } = jest.requireActual('react');
    return createElement('AgentEditor', props);
  },
}));

jest.mock('@/frontend/components/Avatar', () => ({
  AgentAvatar: () => null,
}));

jest.mock('@/frontend/appShell/navigation/chat', () => ({
  chatHref: (target: { agentId?: string }) => ({
    pathname: '/',
    params: { agentId: target.agentId },
  }),
  teamChatHref: (target: { bindingId: string; agentId?: string }) => ({
    pathname: '/team',
    params: target,
  }),
  chatRouteParams: (target: {
    agentId: string;
    kind: string;
    sessionId?: string;
    composerHandoff?: string;
  }) => ({
    agentId: target.agentId,
    ...(target.composerHandoff ? { composerHandoff: target.composerHandoff } : {}),
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
  createChatComposerHandoff: (value: unknown) => mockCreateHandoff(value),
  useOptionalChatSource: () => mockChatSource,
  useStartNewChat: () => mockStartNewChat,
}));

jest.mock('@/frontend/appShell/conversation', () => ({
  ConversationSourceBoundary: ({ children }: { children: React.ReactNode }) => children,
  useConversationAgents: () => ({
    items: mockAgent ? [mockAgent, { id: 'agent-2', name: 'Cherry' }] : [],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));

jest.mock('@/frontend/appShell/conversation/team', () => ({
  TeamCatalogOverlayProvider: ({ children }: { children: React.ReactNode }) => children,
  useOptionalTeamCatalogOverlay: () => mockTeamOverlay,
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
  MainHeaderView: ({
    agent,
    onAgentPress,
    onAgentSwitch,
  }: {
    agent?: Agent;
    onAgentPress?: () => void;
    onAgentSwitch?: () => void;
  }) => {
    const { MainHeaderAgentLabel } = jest.requireActual('../MainHeaderAgentLabel');
    const { Pressable } = jest.requireActual('react-native');
    return agent ? (
      <>
        <MainHeaderAgentLabel agent={agent} onPress={onAgentPress} />
        {onAgentSwitch ? (
          <Pressable testID="main-header-agent-switch" onPress={onAgentSwitch} />
        ) : null}
      </>
    ) : null;
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
    ContentState: {
      Loading: () => null,
      Error: () => null,
      Empty: (props: object) => createElement('ContentStateEmpty', props),
    },
    SearchField: (props: object) => createElement('SearchField', props),
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
    mockChatSource = null;
    mockTeamOverlay = null;
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

  it('edits the current Agent directly from its name', async () => {
    await act(async () => {
      renderer = create(<MainHeader blurTarget={{ current: null }} />);
    });
    await act(async () =>
      renderer!.root.findByProps({ testID: 'current-agent-label' }).props.onPress(),
    );
    expect(renderer!.root.findByType('AgentEditor').props).toMatchObject({
      agentId: 'agent-1',
      presentation: 'sheet',
    });
    expect(renderer!.root.findAllByProps({ accessibilityRole: 'radio' })).toHaveLength(0);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it.each([
    ['agent-1', 'Peanut'],
    ['agent-2', 'Cherry'],
  ])('selects %s through the separate switch button in wide-rail mode', async (agentId, name) => {
    await act(async () => {
      renderer = create(
        <NavigationShellContext value={{ shellMode: 'wide-rail' } as never}>
          <MainHeader blurTarget={{ current: null }} />
        </NavigationShellContext>,
      );
    });
    await act(async () =>
      renderer!.root.findByProps({ testID: 'main-header-agent-switch' }).props.onPress(),
    );
    await act(async () =>
      renderer!.root
        .findByProps({ accessibilityRole: 'radio', accessibilityLabel: name })
        .props.onPress(),
    );
    if (agentId === 'agent-1') expect(mockSetParams).not.toHaveBeenCalled();
    else expect(mockSetParams).toHaveBeenCalledWith({ agentId, sessionId: undefined });
    expect(renderer!.root.findAllByProps({ accessibilityRole: 'radio' })).toHaveLength(0);
  });

  it('shows the agent switch trigger in compact-dock mode and opens the picker', async () => {
    await act(async () => {
      renderer = create(
        <NavigationShellContext value={{ shellMode: 'compact-dock' } as never}>
          <MainHeader blurTarget={{ current: null }} />
        </NavigationShellContext>,
      );
    });
    await act(async () =>
      renderer!.root.findByProps({ testID: 'main-header-agent-switch' }).props.onPress(),
    );
    expect(
      renderer!.root.findAllByProps({ accessibilityRole: 'radio' }, { deep: false }),
    ).toHaveLength(2);
  });

  it('shows CloudMark and accessible suffix on MainHeaderAgentLabel when isCloud is true', async () => {
    await act(async () => {
      renderer = create(<MainHeaderAgentLabel agent={{ name: 'Peanut', isCloud: true }} />);
    });
    const label = renderer!.root.findByProps({ testID: 'current-agent-label' });
    expect(label.props.accessibilityLabel).toBe('Peanut, teamAgent.cloudExecution');
    expect(
      renderer!.root.findAllByProps({ testID: 'cloud-execution-mark' }, { deep: false }),
    ).toHaveLength(1);
  });

  it('merges team agents with search, hides edit actions on cloud rows, distinguishes matching IDs by source, and switches to team chat', async () => {
    mockChatSource = { source: 'local', openLocal: mockOpenLocal, openTeam: mockOpenTeam };
    mockTeamOverlay = {
      agents: [
        {
          id: 'agent-1',
          name: 'Cloud Twin',
          groupName: 'Research',
          source: { kind: 'team', bindingId: 'binding-1' },
          configuration: 'unknown',
        },
      ],
    };

    await act(async () => {
      renderer = create(<MainHeader blurTarget={{ current: null }} />);
    });
    await act(async () =>
      renderer!.root.findByProps({ testID: 'main-header-agent-switch' }).props.onPress(),
    );

    const searchField = renderer!.root.findByProps({ testID: 'main-header-agent-picker-search' });
    expect(searchField).toBeDefined();

    const options = renderer!.root.findAllByProps({ accessibilityRole: 'radio' }, { deep: false });
    const localOption = options.find((node) => node.props.accessibilityLabel === 'Peanut');
    const cloudOption = options.find(
      (node) => node.props.accessibilityLabel === 'Cloud Twin, teamAgent.cloudExecution',
    );
    expect(localOption?.props.accessibilityState.checked).toBe(true);
    expect(cloudOption?.props.accessibilityState.checked).toBe(false);
    expect(
      renderer!.root.findAllByProps({ accessibilityLabel: 'common.edit: Peanut' }, { deep: false }),
    ).toHaveLength(1);
    expect(
      renderer!.root.findAllByProps(
        { accessibilityLabel: 'common.edit: Cloud Twin' },
        { deep: false },
      ),
    ).toHaveLength(0);
    expect(
      renderer!.root.findAllByProps({ testID: 'cloud-execution-mark' }, { deep: false }),
    ).toHaveLength(1);

    await act(async () => searchField.props.onChangeText('no-match'));
    expect(renderer!.root.findByType('ContentStateEmpty').props.title).toBe('agent.list.noResults');

    await act(async () => searchField.props.onChangeText('Research'));
    const filteredOptions = renderer!.root.findAllByProps(
      { accessibilityRole: 'radio' },
      { deep: false },
    );
    expect(filteredOptions).toHaveLength(1);
    await act(async () => filteredOptions[0].props.onPress());

    expect(mockOpenTeam).toHaveBeenCalledWith({ bindingId: 'binding-1', agentId: 'agent-1' });
  });

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
    } as unknown as React.ComponentProps<typeof AgentPickerSheet>['catalog'];
    await act(async () => {
      renderer = create(
        <AgentPickerSheet
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
    expect(onSelect).not.toHaveBeenCalled();
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

  it.each(['session-1', undefined])(
    'starts a blank composer from %s with the current Agent',
    async (sessionId) => {
      mockSessionId = sessionId;
      await act(async () => {
        renderer = create(<NewSessionHarness />);
      });

      const button = renderer?.root.findByProps({ testID: 'new-session-button' });
      await act(async () => button?.props.onPress());

      expect(mockCreateHandoff).toHaveBeenCalledWith({ attachments: [], draft: '' });
      expect(mockSetParams).toHaveBeenCalledWith({
        agentId: 'agent-1',
        composerHandoff: 'blank-composer',
        sessionId: undefined,
      });
    },
  );

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
