import { type ReactNode, useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type {
  AgentSummary,
  ConversationSource,
  ConversationSummary,
  OperationOutcome,
} from '@/frontend/appShell/conversation';

import type {
  useSidebarSelection,
  useSidebarSelectionSnapshot,
} from '../../SidebarSelectionProvider';
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
const mockConfirm = jest.fn();
const mockToast = jest.fn();
const mockProgress = { set: jest.fn() };
let mockSelectedSessionId: string | undefined;
let mockSidebarPresence: 'open' | 'closed' = 'open';
let mockSource: ConversationSource | undefined;
let mockUseSelectionProvider = false;
let mockSelectionStore: ReturnType<typeof useSidebarSelection> | undefined;
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
  useConversationSource: () =>
    mockSource ?? {
      scope: 'local-scope',
      ref: { kind: 'local' },
      catalog: { listSessionChildren: jest.fn() },
    },
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
  useFocusedBackPress: jest.fn(),
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
jest.mock('@/frontend/components/Selection', () =>
  jest.requireActual('@/frontend/components/Selection/selection'),
);
jest.mock('@/frontend/hooks/useThemeColor', () => ({ useThemeColor: () => 'currentColor' }));
jest.mock('../../SidebarSelectionProvider', () => ({
  useSidebarSelection: () =>
    mockUseSelectionProvider ? mockSelectionModule.useSidebarSelection() : mockDrawerSelection(),
  useSidebarSelectionSnapshot: (select: Parameters<typeof useSidebarSelectionSnapshot>[0]) =>
    mockUseSelectionProvider ? mockSelectionModule.useSidebarSelectionSnapshot(select) : false,
}));
jest.mock('@cherrystudio/ui/components', () => ({
  ContentState: { Loading: () => null, Empty: () => null, Error: () => null },
  ContextMenu: { Trigger: jest.requireActual('react-native').Pressable },
  SelectionIndicator: () => null,
  useAlert: () => ({ alert: { confirm: mockConfirm } }),
  useToast: () => ({ toast: { show: mockToast } }),
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
    cancelAnimation: jest.fn(),
    useSharedValue: () => mockProgress,
    withTiming: (value: number) => value,
  };
});

const mockSelectionModule = jest.requireActual<typeof import('../../SidebarSelectionProvider')>(
  '../../SidebarSelectionProvider',
);
function SelectionProbe() {
  const current = mockSelectionModule.useSidebarSelection();
  useLayoutEffect(() => {
    mockSelectionStore = current;
  });
  return null;
}

function SelectableSidebar() {
  return (
    <mockSelectionModule.SidebarSelectionProvider scope="local-scope">
      <SelectionProbe />
      <SidebarConversationList mode="sessions" showLoading registerEndReachedHandler={jest.fn()} />
    </mockSelectionModule.SidebarSelectionProvider>
  );
}

let renderer: ReactTestRenderer;
const onSelect = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockSelectedSessionId = undefined;
  mockSidebarPresence = 'open';
  mockSource = undefined;
  mockUseSelectionProvider = false;
  mockSelectionStore = undefined;
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
  expect(renderer.root.findByProps({ testID: 'sidebar-session-session-1' })).toBeDefined();
  expect(onSelect).not.toHaveBeenCalled();
});

it('updates a registered list without unregistering it until the list unmounts', () => {
  const unregisterFirst = jest.fn();
  const unregisterLatest = jest.fn();
  const registerList = jest
    .fn()
    .mockReturnValueOnce(unregisterFirst)
    .mockReturnValue(unregisterLatest);
  mockDrawerSelection.mockReturnValue({ registerList });
  const list = (
    <SidebarConversationList mode="sessions" showLoading registerEndReachedHandler={jest.fn()} />
  );
  act(() => renderer.update(list));

  const sessions = [
    mockSession,
    { ...mockSession, ref: { ...mockSession.ref, sessionId: 'session-2' } },
  ];
  mockSessions.mockReturnValue({ data: {}, items: sessions, isSuccess: true });
  act(() =>
    renderer.update(
      <SidebarConversationList mode="sessions" showLoading registerEndReachedHandler={jest.fn()} />,
    ),
  );

  expect(registerList).toHaveBeenLastCalledWith('local-scope:', expect.anything(), sessions);
  expect(unregisterFirst).not.toHaveBeenCalled();
  expect(unregisterLatest).not.toHaveBeenCalled();

  act(() => renderer.update(<ConversationDestinationList onSelect={onSelect} />));
  expect(unregisterLatest).toHaveBeenCalledTimes(1);
  expect(unregisterFirst).not.toHaveBeenCalled();
});

it.each(['before', 'after'] as const)(
  'keeps a failed child selected when deletion finishes %s its promotion to a root',
  async (timing) => {
    const deletion = Promise.withResolvers<OperationOutcome<void>>();
    const remove = jest.fn(
      async (_id: string): Promise<OperationOutcome<void>> => ({
        state: 'applied',
        value: undefined,
      }),
    );
    const root = { ...mockSession, hasChildren: true };
    const child: ConversationSummary = {
      ...mockSession,
      ref: { ...mockSession.ref, sessionId: 'child' },
      forkedFromSessionId: root.ref.sessionId,
    };
    mockSource = {
      ref: { kind: 'local' },
      scope: 'local-scope' as ConversationSource['scope'],
      state: {
        getSnapshot: () => ({ availability: { state: 'enabled' } }),
        subscribe: () => () => {},
      },
      catalog: {
        listAgents: async () => ({ items: [] }),
        listSessions: async () => ({ items: [] }),
        listSessionChildren: async () => ({ items: [] }),
        previewSession: (ref) => ({
          remove: {
            availability: { state: 'enabled' },
            execute: () => remove(ref.sessionId),
          },
        }),
      },
      dispose() {},
    };
    mockSelectedSessionId = child.ref.sessionId;
    mockPath.mockReturnValue({ items: [root, child] });
    mockSessions.mockReturnValue({ data: {}, items: [root], isSuccess: true });
    mockChildren.mockReturnValue({ items: [child] });
    mockUseSelectionProvider = true;
    act(() => renderer.update(<SelectableSidebar />));
    const selection = mockSelectionStore!;
    const childKey = JSON.stringify([mockSource.scope, child.ref.sessionId]);
    remove.mockResolvedValueOnce({ state: 'applied', value: undefined });
    remove.mockImplementationOnce(() => deletion.promise);

    await act(async () => {
      selection.enter();
      selection.toggleAll();
      selection.requestDelete();
      mockConfirm.mock.calls.at(-1)![0].onConfirm();
    });
    act(() => renderer.update(<SelectableSidebar />));
    expect(remove.mock.calls).toEqual([[root.ref.sessionId], [child.ref.sessionId]]);
    expect(renderer.root.findAllByProps({ testID: 'sidebar-session-session-1' })).toHaveLength(0);
    expect(selection.shownIds()).toEqual([]);
    expect(selection.selectedEntries()).toEqual([]);

    const failDeletion = async () => {
      await act(async () => deletion.reject(new Error('Could not stop the running turn')));
    };
    if (timing === 'before') await failDeletion();

    const promoted = { ...child, forkedFromSessionId: null };
    mockSessions.mockReturnValue({ data: {}, items: [promoted], isSuccess: true });
    mockPath.mockReturnValue({ items: [promoted] });
    await act(async () => renderer.update(<SelectableSidebar />));
    if (timing === 'after') await failDeletion();

    expect(selection.getSnapshot()).toMatchObject({
      isDeleting: false,
      isSelecting: true,
      selectedIds: new Set([childKey]),
    });
    expect(selection.shownIds()).toEqual([childKey]);
    expect(selection.selectedEntries().map((entry) => entry.ref.sessionId)).toEqual(['child']);
    expect(
      renderer.root.findByProps({ testID: 'sidebar-session-child' }).props.accessibilityState
        .checked,
    ).toBe(true);

    await act(async () => {
      selection.requestDelete();
      mockConfirm.mock.calls.at(-1)![0].onConfirm();
    });
    expect(remove.mock.calls).toEqual([
      [root.ref.sessionId],
      [child.ref.sessionId],
      [child.ref.sessionId],
    ]);
    expect(selection.getSnapshot().isSelecting).toBe(false);
  },
);
