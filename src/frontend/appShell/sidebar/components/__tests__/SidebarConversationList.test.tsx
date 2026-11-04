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
  useConversationSource: () => ({ scope: 'local-scope', ref: { kind: 'local' } }),
  useConversationPreview: (ref: ConversationSummary['ref']) => mockPreview(ref),
  useConversationSourceState: () => ({ availability: { state: 'enabled' } }),
}));
jest.mock('@/frontend/appShell/navigation/chat', () => ({
  useConversationTarget: () => ({}),
  conversationHref: (ref: ConversationSummary['ref']) => ({
    pathname: '/',
    params: { sessionId: ref.sessionId },
  }),
}));
jest.mock('@/frontend/appShell/navigation', () => ({
  ContextMenuLink: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
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
