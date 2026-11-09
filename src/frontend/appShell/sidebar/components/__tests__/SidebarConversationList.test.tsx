import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AgentSummary, ConversationSummary } from '@/frontend/appShell/conversation';

import { ConversationDestinationList, SidebarConversationList } from '../SidebarConversationList';

const mockAgent: AgentSummary = {
  id: 'agent-1',
  ref: 'agent-ref' as AgentSummary['ref'],
  name: 'Programming',
  configuration: 'available',
};
const mockSession: ConversationSummary = {
  ref: { source: { kind: 'local' }, sessionId: 'session-1' },
  agentId: 'agent-1',
  title: 'Existing discussion',
};
const mockSessions = jest.fn();
const mockChildren = jest.fn();
const mockPath = jest.fn();
let mockSelectedSessionId: string | undefined;
let mockSidebarPresence: 'open' | 'closed' = 'open';
const mockPreview = jest.fn((_ref: ConversationSummary['ref']) => ({}));
const mockDrawerSelection = jest.fn((): { registerList: (...args: unknown[]) => () => void } => {
  throw new Error('The destination list must not require drawer selection');
});

jest.mock('@/frontend/appShell/conversation', () => ({
  useConversationAgents: () => ({
    data: {},
    items: [mockAgent],
    isPending: false,
    isSuccess: true,
  }),
  useConversationSessions: (...args: unknown[]) => mockSessions(...args),
  useConversationSessionChildren: (...args: unknown[]) => mockChildren(...args),
  useConversationSessionPath: (...args: unknown[]) => mockPath(...args),
  useConversationSource: () => ({
    scope: 'local-scope',
    ref: { kind: 'local' },
    catalog: { listSessionChildren: jest.fn() },
  }),
  useConversationPreview: (ref: ConversationSummary['ref']) => mockPreview(ref),
  useConversationAgentStatus: () => undefined,
  useConversationSourceState: () => ({ availability: { state: 'enabled' } }),
}));
jest.mock('@/frontend/appShell/navigation/chat', () => ({
  useConversationTarget: () => ({ sessionId: mockSelectedSessionId }),
  conversationHref: (ref: ConversationSummary['ref']) => ({
    pathname: '/',
    params: { sessionId: ref.sessionId },
  }),
}));
jest.mock('@/frontend/appShell/navigation', () => ({
  ContextMenuLink: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('uniwind', () => ({
  useResolveClassNames: () => ({}),
  useUniwind: () => ({ theme: 'light' }),
}));
jest.mock('../../hooks/useSidebarPresence', () => ({
  useSidebarPresence: () => mockSidebarPresence,
}));
jest.mock('../../context', () => ({
  useSidebarActions: () => ({ closeDrawer: jest.fn() }),
}));
jest.mock('@/frontend/components/Avatar', () => ({ AgentAvatar: () => null }));
jest.mock('@/frontend/components/ConversationStatus', () => ({ ConversationStatus: () => null }));
jest.mock('@/frontend/hooks/useThemeColor', () => ({ useThemeColor: () => 'currentColor' }));
jest.mock('../../SidebarSelectionProvider', () => ({
  useSidebarSelection: () => mockDrawerSelection(),
  useSidebarSelectionSnapshot: () => false,
}));
jest.mock('@cherrystudio/ui/components', () => ({
  ContentState: { Loading: () => null, Empty: () => null, Error: () => null },
  ContextMenu: { Trigger: jest.requireActual('react-native').Pressable },
  useAlert: () => ({ alert: {} }),
  useToast: () => ({ toast: {} }),
}));
jest.mock('@cherrystudio/ui/motion', () => ({
  duration: { base: 1, fast: 1 },
  easing: { settle: undefined },
}));
jest.mock('@cherrystudio/ui/utils', () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(' '),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('react-native-reanimated', () => {
  const transition = {
    duration: () => transition,
    easing: () => transition,
    reduceMotion: () => transition,
  };
  return {
    __esModule: true,
    default: { View: jest.requireActual('react-native').View },
    FadeIn: transition,
    FadeOut: transition,
    LinearTransition: transition,
    ReduceMotion: { System: 'system' },
  };
});

let renderer: ReactTestRenderer;
const onSelect = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockSelectedSessionId = undefined;
  mockSidebarPresence = 'open';
  mockPath.mockReturnValue({ items: [] });
  mockChildren.mockReturnValue({ items: [], hasNextPage: false, isLoading: false, isError: false });
  mockSessions.mockReturnValue({
    data: {},
    items: [mockSession],
    isPending: false,
    isSuccess: true,
    isError: false,
    hasNextPage: false,
  });
  act(() => {
    renderer = create(<ConversationDestinationList onSelect={onSelect} />);
  });
});

afterEach(() => act(() => renderer.unmount()));

it('keeps root navigation separate from lazy child expansion', () => {
  const branch = {
    ...mockSession,
    ref: { source: { kind: 'local' } as const, sessionId: 'fork-1' },
    title: 'A different discussion',
  };
  mockSessions.mockReturnValue({
    data: {},
    items: [{ ...mockSession, hasChildren: true }],
    isSuccess: true,
  });
  mockChildren.mockReturnValue({
    items: [branch],
    isLoading: false,
    isError: false,
    hasNextPage: false,
  });
  press('share-agent-expand-agent-1');
  expect(mockChildren).not.toHaveBeenCalled();
  press('share-session-session-1');
  expect(onSelect).toHaveBeenCalledWith({
    kind: 'session',
    session: expect.objectContaining({ ref: mockSession.ref }),
  });
  expect(mockChildren).not.toHaveBeenCalled();
  onSelect.mockClear();
  press('sidebar-session-expand-session-1');
  expect(mockChildren).toHaveBeenCalledWith(mockSession.ref, true);
  expect(renderer.root.findAllByProps({ testID: 'share-session-session-1' })).not.toHaveLength(0);
  press('share-session-fork-1');
  expect(onSelect).toHaveBeenCalledWith({ kind: 'session', session: branch });
  press('sidebar-session-expand-session-1');
  expect(renderer.root.findAllByProps({ testID: 'share-session-fork-1' })).toHaveLength(0);
});

it('loads each nested sibling list only after its own disclosure is expanded', () => {
  const root = { ...mockSession, hasChildren: true };
  const branch = {
    ...mockSession,
    ref: { ...mockSession.ref, sessionId: 'child' },
    hasChildren: true,
    forkedFromSessionId: root.ref.sessionId,
  };
  const leaf = {
    ...mockSession,
    ref: { ...mockSession.ref, sessionId: 'grandchild' },
    hasChildren: false,
    forkedFromSessionId: 'child',
  };
  mockSessions.mockReturnValue({ data: {}, items: [root], isSuccess: true });
  mockChildren.mockImplementation((parent: ConversationSummary['ref']) => ({
    items: parent.sessionId === root.ref.sessionId ? [branch] : [leaf],
    hasNextPage: false,
    isLoading: false,
    isError: false,
  }));
  press('share-agent-expand-agent-1');
  expect(mockChildren).not.toHaveBeenCalled();
  press('sidebar-session-expand-session-1');
  expect(mockChildren).toHaveBeenCalledWith(root.ref, true);
  expect(renderer.root.findAllByProps({ testID: 'share-session-grandchild' })).toHaveLength(0);
  press('sidebar-session-expand-child');
  expect(mockChildren).toHaveBeenCalledWith(branch.ref, true);
  press('share-session-grandchild');
  expect(onSelect).toHaveBeenCalledWith({ kind: 'session', session: leaf });
  press('sidebar-session-expand-child');
  expect(renderer.root.findAllByProps({ testID: 'share-session-grandchild' })).toHaveLength(0);
  expect(renderer.root.findAllByProps({ testID: 'share-session-child' })).not.toHaveLength(0);
});

it('keeps the selected lineage visible when its root and ancestors are outside loaded pages', () => {
  mockDrawerSelection.mockReturnValue({ registerList: () => () => {} });
  const root = { ...mockSession, hasChildren: true };
  const branch = {
    ...mockSession,
    ref: { ...mockSession.ref, sessionId: 'child' },
    hasChildren: true,
    forkedFromSessionId: root.ref.sessionId,
  };
  const leaf = {
    ...mockSession,
    ref: { ...mockSession.ref, sessionId: 'grandchild' },
    hasChildren: false,
    forkedFromSessionId: 'child',
  };
  mockSelectedSessionId = 'grandchild';
  mockPath.mockImplementation((sessionId?: string) => ({
    items: sessionId ? [root, branch, leaf] : [],
  }));
  mockSessions.mockReturnValue({
    data: {},
    items: [{ ...mockSession, ref: { ...mockSession.ref, sessionId: 'other' } }],
    isSuccess: true,
  });
  act(() =>
    renderer.update(
      <SidebarConversationList mode="sessions" showLoading registerEndReachedHandler={jest.fn()} />,
    ),
  );
  expect(mockPath).toHaveBeenCalledWith('grandchild');
  expect(mockChildren).toHaveBeenCalledWith(root.ref, true);
  expect(mockChildren).toHaveBeenCalledWith(branch.ref, true);
  expect(
    renderer.root.findByProps({ testID: 'sidebar-session-grandchild' }).props.accessibilityState
      .selected,
  ).toBe(true);
  expect(renderer.root.findAllByProps({ testID: 'sidebar-session-session-1' })).not.toHaveLength(0);

  press('sidebar-session-expand-child');
  expect(renderer.root.findAllByProps({ testID: 'sidebar-session-grandchild' })).toHaveLength(0);
  mockChildren.mockClear();
  mockSidebarPresence = 'closed';
  act(() =>
    renderer.update(
      <SidebarConversationList mode="sessions" showLoading registerEndReachedHandler={jest.fn()} />,
    ),
  );
  expect(mockPath).toHaveBeenLastCalledWith(undefined);
  expect(mockChildren).not.toHaveBeenCalled();

  mockSidebarPresence = 'open';
  act(() =>
    renderer.update(
      <SidebarConversationList mode="sessions" showLoading registerEndReachedHandler={jest.fn()} />,
    ),
  );
  expect(mockChildren).toHaveBeenCalledWith(root.ref, true);
  expect(mockChildren).toHaveBeenCalledWith(branch.ref, true);
  expect(
    renderer.root.findByProps({ testID: 'sidebar-session-grandchild' }).props.accessibilityState
      .selected,
  ).toBe(true);
});

function press(testID: string) {
  act(() => renderer.root.findByProps({ testID }).props.onPress());
}

it('chooses a new conversation from the Agent row without expanding or querying sessions', () => {
  press('share-agent-agent-1');
  expect(onSelect.mock.calls).toEqual([[{ kind: 'agent', agent: mockAgent }]]);
  expect(mockSessions).not.toHaveBeenCalled();
  expect(mockDrawerSelection).not.toHaveBeenCalled();
});

it('expands independently and chooses only the pressed existing conversation', () => {
  press('share-agent-expand-agent-1');
  expect(onSelect).not.toHaveBeenCalled();
  expect(mockSessions).toHaveBeenCalledWith(mockAgent.ref);
  expect(mockDrawerSelection).not.toHaveBeenCalled();

  press('share-session-session-1');
  expect(onSelect.mock.calls).toEqual([[{ kind: 'session', session: mockSession }]]);

  press('share-agent-expand-agent-1');
  expect(renderer.root.findAllByProps({ testID: 'share-session-session-1' })).toHaveLength(0);
});

it('retains the existing per-Agent pagination in the destination list', () => {
  const sessions = Array.from({ length: 12 }, (_, index) => ({
    ...mockSession,
    ref: { ...mockSession.ref, sessionId: `paged-${index}` },
  }));
  mockSessions.mockReturnValue({
    data: {},
    items: sessions,
    isPending: false,
    isSuccess: true,
    isError: false,
    hasNextPage: false,
  });
  press('share-agent-expand-agent-1');
  expect(renderer.root.findAllByProps({ testID: 'share-session-paged-11' })).toHaveLength(0);
  press('sidebar-sessions-view-all');
  expect(renderer.root.findByProps({ testID: 'share-session-paged-11' })).toBeDefined();
  expect(onSelect).not.toHaveBeenCalled();
});

it('keeps the ordinary sidebar Agent row as full-row expansion', () => {
  mockDrawerSelection.mockReturnValue({ registerList: () => () => {} });
  act(() => {
    renderer.update(
      <SidebarConversationList mode="agents" showLoading registerEndReachedHandler={jest.fn()} />,
    );
  });
  expect(renderer.root.findAllByProps({ testID: 'share-agent-expand-agent-1' })).toHaveLength(0);
  press('sidebar-agent-agent-1');
  expect(mockSessions).toHaveBeenCalledWith(mockAgent.ref);
  expect(renderer.root.findByProps({ testID: 'sidebar-session-session-1' })).toBeDefined();
  expect(onSelect).not.toHaveBeenCalled();
});
