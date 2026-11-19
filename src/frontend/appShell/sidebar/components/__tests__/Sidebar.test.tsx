import { StrictMode, type ComponentProps, type ReactNode } from 'react';
import { Keyboard } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ChatTarget, RemoteChatTarget } from '@/frontend/appShell/navigation/chat';
import { getChatComposerHandoff } from '@/frontend/appShell/navigation/chat/chatComposerHandoff';

import type { SidebarActions } from '../../context';
import { Sidebar } from '../Sidebar';

const mockSetParams = jest.fn();
const mockStartRemoteChat = jest.fn();
let mockRemoteCallback = mockStartRemoteChat;
const mockRefetch = jest.fn();
let mockAgents = [{ id: 'first-agent' }, { id: 'current-agent' }];
let mockPublishAgents: (items: { id: string }[]) => void;
let mockIsLoading = false;
let mockIsChatFocused = true;
let mockRemoteTarget: RemoteChatTarget = {};
let mockSessionAgentId: string | undefined = 'current-agent';
let mockSessionIsLoading = false;
let mockSessionIsPending: boolean | undefined;
const mockGuardRefs = new Map<{ current: unknown }, unknown>();

jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    useRef: (initial: unknown) => {
      const ref = actual.useRef(initial);
      if (!mockGuardRefs.has(ref)) mockGuardRefs.set(ref, initial);
      return ref;
    },
  };
});
const mockSessionRead = jest.fn();
type TestState = { key: string; index: number; routes: TestRoute[] };
type TestRoute = { key: string; name: string; params?: Record<string, unknown>; state?: TestState };
let mockRootOverride: TestState | undefined;
let mockLeafKey = 'chat-leaf';
let mockNestedChatIndex = 0;

function mockRootState(): TestState {
  const chat: TestRoute = {
    key: 'chat',
    name: '(chat)',
    state: {
      key: 'chat-stack',
      index: mockNestedChatIndex,
      routes: [
        ...(mockNestedChatIndex ? [{ key: 'inactive', name: 'index' }] : []),
        {
          key: mockLeafKey,
          name: mockSource === 'local' ? 'index' : 'remote',
          params: mockSource === 'local' ? { ...mockLocalChat } : { ...mockRemoteTarget },
        },
      ],
    },
  };
  const stack = {
    key: mockContentStack?.key ?? 'main',
    index: mockContentStack?.index ?? 0,
    routes: [
      chat,
      ...Array.from({ length: mockContentStack?.index ?? 0 }, (_, i) => ({
        key: 'destination-' + i,
        name: mockPage[0],
        params: mockParams,
      })),
    ],
  };
  return (
    mockRootOverride ?? {
      key: 'root',
      index: 0,
      routes: [
        {
          key: 'drawer-route',
          name: '(drawer)',
          state: {
            key: 'drawer',
            index: 0,
            routes: [{ key: 'main-route', name: '(main)', state: stack }],
          },
        },
      ],
    }
  );
}

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockCloseDrawer = jest.fn();
const mockCancelPending = jest.fn();
const mockWaitForClose = jest.fn(async () => {
  if (!mockCanDock) mockCloseDrawer();
  return true;
});
const mockDispatch = jest.fn();
const mockPaneOpen = jest.fn();
let mockLocalChat: ChatTarget | undefined;
let mockSource: 'local' | 'remote' = 'local';
let mockPaneAvailable = false;
let mockCanDock = false;
let mockPage = ['(chat)'];
let mockParams: Record<string, string> = {};
let mockContentStack: { index: number; key: string } | undefined;
let mockActions: SidebarActions;

jest.mock('expo-router', () => ({
  useSegments: () => ['(drawer)', '(main)', ...mockPage],
  useGlobalSearchParams: () => mockParams,
  useRootNavigationState: () => mockRootState(),
  useRouter: () => ({ push: mockPush, replace: mockReplace, setParams: mockSetParams }),
}));

jest.mock('expo-router/react-navigation', () => ({
  StackActions: { popToTop: () => ({ type: 'POP_TO_TOP' }) },
}));

jest.mock('uniwind', () => ({ useUniwind: () => ({ theme: 'light' }) }));
jest.mock('@/frontend/hooks/useThemeColor', () => ({ useThemeColor: () => '#fff' }));

jest.mock('@/frontend/appShell/navigation/chat', () => ({
  ...jest.requireActual('@/frontend/appShell/navigation/chat/chatRoute'),
  ...jest.requireActual('@/frontend/appShell/navigation/chat/chatComposerHandoff'),
  useConversationTarget: () => ({}),
  useChatSource: () => ({
    localChat: mockLocalChat,
    source: mockSource,
    remoteTarget: mockRemoteTarget,
    isChatFocused: mockIsChatFocused,
    viewMode: 'sessions',
    startRemoteChat: mockRemoteCallback,
  }),
}));

jest.mock('@/frontend/hooks/agent', () => ({
  useAgentSession: (sessionId: string | undefined) => {
    mockSessionRead(sessionId);
    return {
      data: sessionId ? { agentId: mockSessionAgentId } : undefined,
      isLoading: mockSessionIsLoading,
      isPending: mockSessionIsPending ?? mockSessionIsLoading,
    };
  },
  useAgentsApi: () => {
    const { useReducer } = jest.requireActual('react');
    const [, commitQuery] = useReducer((value: number) => value + 1, 0);
    mockPublishAgents = (items) => {
      mockAgents = items;
      mockIsLoading = false;
      commitQuery();
    };
    return {
      agents: mockAgents,
      isLoading: mockIsLoading,
      query: { isPending: mockIsLoading },
      // Model the query subscription: publishing a refetch result commits the hook's new list.
      refetch: () =>
        mockRefetch().then((result: { data: { items: { id: string }[] } }) => {
          mockPublishAgents(result.data.items);
          return result;
        }),
    };
  },
}));

jest.mock('@/frontend/appShell/pane/state', () => ({
  useFilePane: () => ({ isAvailable: mockPaneAvailable, open: mockPaneOpen }),
}));
jest.mock('@/frontend/appShell/layout', () => ({ useCanDockSidebar: () => mockCanDock }));
jest.mock('../../SidebarColumn', () => ({
  useSidebarColumn: () => ({
    column: { kind: mockCanDock ? 'permanent' : 'overlay' },
    setContent: jest.fn(),
  }),
}));
jest.mock('../../hooks/useSessionSearch', () => ({
  sessionSearchResultHref: jest.fn(),
  useSessionSearch: () => jest.fn(),
  useSessionSearchRequest: () => ({}),
}));
jest.mock('../../hooks/useCloseDrawerForNavigation', () => ({
  useCloseDrawerForNavigation: () => ({
    cancelPending: mockCancelPending,
    waitForClose: mockWaitForClose,
  }),
}));
jest.mock('../../SidebarSelectionProvider', () => ({
  SidebarSelectionProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('../SidebarHeader', () => ({ SidebarHeader: () => null }));
jest.mock('../SidebarFooter', () => ({ SidebarFooter: () => null }));
jest.mock('../SidebarBody', () => ({
  SidebarBody: () => {
    const { useSidebarActions } = jest.requireActual('../../context');
    mockActions = useSidebarActions('SidebarBody');
    return null;
  },
}));

const navigation = {
  closeDrawer: mockCloseDrawer,
  dispatch: mockDispatch,
  getState: () => ({
    routes: [{ name: '(main)', state: mockContentStack }],
  }),
} as unknown as ComponentProps<typeof Sidebar>['navigation'];

describe('Sidebar', () => {
  let renderer: ReactTestRenderer;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSource = 'local';
    mockRootOverride = undefined;
    mockLeafKey = 'chat-leaf';
    mockNestedChatIndex = 0;
    mockIsChatFocused = true;
    mockRemoteTarget = {};
    mockRemoteCallback = mockStartRemoteChat;
    mockIsLoading = false;
    mockAgents = [{ id: 'first-agent' }, { id: 'current-agent' }];
    mockSessionAgentId = 'current-agent';
    mockSessionIsLoading = false;
    mockSessionIsPending = undefined;
    mockGuardRefs.clear();
    mockRefetch.mockReset();
    mockLocalChat = undefined;
    mockPaneAvailable = false;
    mockCanDock = false;
    mockPage = ['(chat)'];
    mockParams = {};
    mockContentStack = { index: 0, key: 'main' };
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  function render() {
    act(() => {
      renderer = create(<Sidebar navigation={navigation} />);
    });
  }

  test.each([
    [{ agentId: 'selected-agent', kind: 'draft' }, { agentId: 'selected-agent' }],
    [{ kind: 'session', sessionId: 'selected-session' }, { sessionId: 'selected-session' }],
  ] as const)('carries the chat identity to Skills: %j', async (chat, params) => {
    mockLocalChat = chat;
    render();

    await act(async () => mockActions.openSkills());

    expect(mockCloseDrawer).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/skills',
      params: { agentId: undefined, sessionId: undefined, ...params },
    });
  });

  test('opens a destination above the chat and swaps it for another destination', async () => {
    render();
    await act(async () => mockActions.openPaintings());
    expect(mockPush).toHaveBeenCalledWith('/drawings');

    mockContentStack = { index: 1, key: 'main' };
    await act(async () => mockActions.navigateAgents());
    expect(mockReplace).toHaveBeenCalledWith('/agents');
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  test.each([true, false])(
    'reselecting the visible drawing page keeps its screen (wide=%s)',
    async (wide) => {
      mockCanDock = wide;
      mockPage = ['drawings'];
      mockContentStack = { index: 1, key: 'main' };
      render();

      await act(async () => mockActions.openPaintings());
      await act(async () => mockActions.openPaintings());
      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    },
  );

  test('reselecting Settings from a detail still opens its root page', async () => {
    mockCanDock = true;
    mockPage = ['settings', 'about'];
    mockContentStack = { index: 1, key: 'main' };
    render();

    await act(async () => mockActions.openSettings());
    expect(mockReplace).toHaveBeenCalledWith('/settings');
  });

  test('opens Skills for a changed chat context on the same route', async () => {
    mockCanDock = true;
    mockLocalChat = { kind: 'session', sessionId: 'new-session' };
    mockPage = ['skills'];
    mockParams = { sessionId: 'previous-session' };
    mockContentStack = { index: 1, key: 'main' };
    render();

    await act(async () => mockActions.openSkills());
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/skills',
      params: { agentId: undefined, sessionId: 'new-session' },
    });
  });

  test.each([true, false])(
    'only navigates after a completed close (completed=%s)',
    async (ready) => {
      const closed = Promise.withResolvers<boolean>();
      mockWaitForClose.mockReturnValueOnce(closed.promise);
      render();

      act(() => {
        mockActions.openPaintings();
      });
      expect(mockWaitForClose).toHaveBeenCalledTimes(1);
      expect(mockPush).not.toHaveBeenCalled();
      await act(async () => closed.resolve(ready));
      expect(mockPush).toHaveBeenCalledTimes(ready ? 1 : 0);
    },
  );

  test('brings the chat back in front of a destination before opening a conversation', () => {
    mockContentStack = { index: 2, key: 'main' };
    render();

    act(() => mockActions.closeDrawer());

    expect(mockDispatch).toHaveBeenCalledWith({ target: 'main', type: 'POP_TO_TOP' });
  });

  test.each(['recent conversation', 'search', 'incoming link'])(
    'a newer %s supersedes Drawings while the drawer is closing',
    async (next) => {
      render();
      const closed = Promise.withResolvers<boolean>();
      mockWaitForClose.mockReturnValueOnce(closed.promise);
      mockCancelPending.mockImplementationOnce(() => closed.resolve(false));

      act(() => {
        mockActions.openPaintings();
      });
      act(() => {
        if (next === 'recent conversation') mockActions.closeDrawer();
        else if (next === 'search') mockActions.openSearch?.();
        else {
          mockParams = { sessionId: 'notification-session' };
          renderer.update(<Sidebar navigation={navigation} />);
        }
      });
      await act(async () => closed.resolve(true));
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    },
  );

  test('leaves the stack alone when the chat is already showing', () => {
    render();
    act(() => mockActions.closeDrawer());
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  test('opens files beside the chat a destination covered', () => {
    mockPaneAvailable = true;
    mockContentStack = { index: 1, key: 'main' };
    render();

    act(() => mockActions.openLibrary());

    expect(mockDispatch).toHaveBeenCalledWith({ target: 'main', type: 'POP_TO_TOP' });
    expect(mockPaneOpen).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  test.each([
    [
      'local',
      { kind: 'session', sessionId: 'selected-session' },
      { sourceChat: '{"sessionId":"selected-session"}' },
    ],
    ['remote', undefined, {}],
  ] as const)(
    'lets a %s chat receive files from the library page',
    async (source, chat, params) => {
      mockSource = source;
      mockLocalChat = chat;
      render();

      await act(async () => mockActions.openLibrary());

      expect(mockPush).toHaveBeenCalledWith({ pathname: '/library', params });
    },
  );

  function commitChat() {
    mockContentStack = { index: 0, key: 'main' };
    mockPage = mockSource === 'local' ? ['(chat)'] : ['(chat)', 'remote'];
    mockParams = mockSource === 'local' ? { agentId: 'current-agent' } : { ...mockRemoteTarget };
    mockIsChatFocused = true;
    act(() => renderer.update(<Sidebar navigation={navigation} />));
  }

  function expectEmptyDraft(agentId: string) {
    expect(mockSetParams).toHaveBeenCalledTimes(1);
    const params = mockSetParams.mock.calls[0][0];
    expect(params).toEqual({
      agentId,
      sessionId: undefined,
      composerHandoff: expect.any(String),
      selectionHandoff: undefined,
      workspaceDraftId: undefined,
      sshDraftId: undefined,
      messageId: undefined,
      messageRequestId: undefined,
    });
    expect(getChatComposerHandoff(params.composerHandoff)).toEqual({ attachments: [], draft: '' });
  }

  test.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])(
    'creates an empty draft only after chat commits (wide=%s, destination=%s)',
    async (wide, destination) => {
      mockCanDock = wide;
      mockLocalChat = { kind: 'session', sessionId: 'covered-session' };
      if (destination) {
        mockPage = ['plugins'];
        mockParams = { agentId: 'destination-agent', sessionId: 'destination-session' };
        mockContentStack = { key: 'main', index: 1 };
        mockIsChatFocused = false;
      }
      const dismiss = jest.spyOn(Keyboard, 'dismiss');
      render();
      jest.clearAllMocks();
      act(() => {
        mockActions.startNewChat();
        expect(mockSetParams).not.toHaveBeenCalled();
        expect(mockPush).not.toHaveBeenCalled();
      });
      expect(dismiss).toHaveBeenCalledTimes(1);
      expect(mockCancelPending).toHaveBeenCalled();
      expect(mockCancelPending.mock.invocationCallOrder[0]).toBeLessThan(
        dismiss.mock.invocationCallOrder[0],
      );
      expect(mockCloseDrawer).toHaveBeenCalledTimes(wide ? 0 : 1);
      expect(mockWaitForClose).not.toHaveBeenCalled();
      if (!wide)
        expect(dismiss.mock.invocationCallOrder[0]).toBeLessThan(
          mockCloseDrawer.mock.invocationCallOrder[0],
        );
      if (destination) {
        expect(mockDispatch).toHaveBeenCalledWith({ type: 'POP_TO_TOP', target: 'main' });
        expect(mockSetParams).not.toHaveBeenCalled();
        commitChat();
      } else expect(mockDispatch).not.toHaveBeenCalled();
      await act(async () => {});
      expectEmptyDraft('current-agent');
      if (destination)
        expect(mockDispatch.mock.invocationCallOrder[0]).toBeLessThan(
          mockSetParams.mock.invocationCallOrder[0],
        );
      expect(mockSessionRead).toHaveBeenCalledWith('covered-session');
      expect(mockStartRemoteChat).not.toHaveBeenCalled();
    },
  );

  test.each(['current-agent', 'missing-agent'])('draft agent fallback from %s', async (agentId) => {
    mockLocalChat = { kind: 'draft', agentId };
    render();
    await act(async () => mockActions.startNewChat());
    expectEmptyDraft(agentId === 'current-agent' ? agentId : 'first-agent');
  });

  test('no available agents opens the agent catalog after commit', async () => {
    mockAgents = [];
    render();
    await act(async () => mockActions.startNewChat());
    expect(mockPush).toHaveBeenCalledWith('/agents');
    expect(mockSetParams).not.toHaveBeenCalled();
  });

  function captureRequestRelease(deadline: unknown) {
    const refs = [...mockGuardRefs];
    const requestRefs = refs.filter(([{ current }]) => {
      if (!current || typeof current !== 'object') return false;
      return 'originatingFingerprint' in current && 'phase' in current;
    });
    expect(deadline).toBeDefined();
    const timeoutRefs = refs.filter(([ref]) => ref.current === deadline);
    const guardRefs = refs.filter(
      ([, initial]) => typeof initial === 'function' && initial.name === 'NO_NEW_CHAT_GUARD',
    );
    expect(requestRefs).toHaveLength(1);
    expect(timeoutRefs).toHaveLength(1);
    expect(guardRefs).toHaveLength(1);
    // Capture populated objects before abandonment, independent of declaration order.
    const [[requestRef]] = requestRefs;
    const [[requestTimeoutRef]] = timeoutRefs;
    const [[guardRef, noOp]] = guardRefs;
    expect(new Set([requestRef, requestTimeoutRef, guardRef]).size).toBe(3);
    expect(guardRef.current).not.toBe(noOp);
    return () => {
      expect(requestRef.current).toBeUndefined();
      expect(requestTimeoutRef.current).toBeUndefined();
      expect(guardRef.current).toBe(noOp);
    };
  }

  test.each([
    [0, false],
    [0, true],
    [1, false],
  ])(
    'tap deadline works before the first effect (main index=%s, focused=%s)',
    async (index, focused) => {
      jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] });
      const timeout = jest.spyOn(globalThis, 'setTimeout');
      let expectRequestReleased!: () => void;
      mockContentStack = { key: 'main', index };
      mockIsChatFocused = focused;
      if (index) mockPage = ['plugins'];
      render();
      act(() => {
        mockActions.startNewChat();
        expectRequestReleased = captureRequestRelease(timeout.mock.results.at(-1)?.value);
        // React has not committed the state trigger or run the request effect yet.
        jest.advanceTimersByTime(1501);
      });
      commitChat();
      await act(async () => {});
      expect(mockSetParams).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
      expectRequestReleased();
    },
  );

  test('a replacement tap after the pop still has a deadline before chat focus commits', async () => {
    jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] });
    const timeout = jest.spyOn(globalThis, 'setTimeout');
    mockPage = ['plugins'];
    mockContentStack = { key: 'main', index: 1 };
    mockIsChatFocused = false;
    render();
    act(() => mockActions.startNewChat());
    mockContentStack = { key: 'main', index: 0 };
    act(() => renderer.update(<Sidebar navigation={navigation} />));
    act(() => mockActions.startNewChat());
    const expectRequestReleased = captureRequestRelease(timeout.mock.results.at(-1)?.value);
    act(() => jest.advanceTimersByTime(20000));
    commitChat();
    await act(async () => {});
    expect(mockSetParams).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expectRequestReleased();
  });

  test('a paused pending session never falls back when isLoading is false', async () => {
    mockLocalChat = { kind: 'session', sessionId: 'covered-session' };
    mockSessionAgentId = undefined;
    mockSessionIsPending = true;
    mockSessionIsLoading = false;
    render();
    await act(async () => mockActions.startNewChat());
    for (let i = 0; i < 5; i++) act(() => renderer.update(<Sidebar navigation={navigation} />));
    expect(mockSetParams).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    mockSessionAgentId = 'current-agent';
    mockSessionIsPending = false;
    act(() => renderer.update(<Sidebar navigation={navigation} />));
    expectEmptyDraft('current-agent');
  });

  test('session settlement chooses from the latest committed growing agent list', async () => {
    mockAgents = [{ id: 'first-agent' }];
    mockLocalChat = { kind: 'session', sessionId: 'covered-session' };
    mockSessionAgentId = undefined;
    mockSessionIsLoading = true;
    render();
    await act(async () => mockActions.startNewChat());
    mockAgents = [...mockAgents, { id: 'current-agent' }];
    act(() => renderer.update(<Sidebar navigation={navigation} />));
    expect(mockSetParams).not.toHaveBeenCalled();
    mockSessionAgentId = 'current-agent';
    mockSessionIsLoading = false;
    act(() => renderer.update(<Sidebar navigation={navigation} />));
    await act(async () => {});
    expectEmptyDraft('current-agent');
  });

  test('refetch settlement rechecks a session that has become pending', async () => {
    const pending = Promise.withResolvers<{ data: { items: { id: string }[] } }>();
    mockLocalChat = { kind: 'session', sessionId: 'covered-session' };
    mockIsLoading = true;
    mockRefetch.mockReturnValue(pending.promise);
    render();
    await act(async () => mockActions.startNewChat());
    mockSessionIsPending = true;
    mockSessionIsLoading = false;
    mockSessionAgentId = undefined;
    act(() => renderer.update(<Sidebar navigation={navigation} />));
    await act(async () => pending.resolve({ data: { items: mockAgents } }));
    expect(mockSetParams).not.toHaveBeenCalled();
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    mockSessionAgentId = 'current-agent';
    mockSessionIsPending = false;
    act(() => renderer.update(<Sidebar navigation={navigation} />));
    expectEmptyDraft('current-agent');
  });

  test.each(['returning', 'resolve', 'reject'] as const)(
    'abandonment releases request guards and ignores late %s work',
    async (completion) => {
      jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] });
      const timeout = jest.spyOn(globalThis, 'setTimeout');
      const pending = Promise.withResolvers<{ data: { items: { id: string }[] } }>();
      mockPage = ['plugins'];
      mockContentStack = { key: 'main', index: 1 };
      mockIsChatFocused = false;
      mockIsLoading = true;
      mockRefetch.mockReturnValue(pending.promise);
      render();
      act(() => mockActions.startNewChat());
      if (completion !== 'returning') commitChat();
      const expectRequestReleased = captureRequestRelease(timeout.mock.results.at(-1)?.value);
      act(() => jest.advanceTimersByTime(20000));
      expectRequestReleased();
      expect(jest.getTimerCount()).toBe(0);
      if (completion !== 'returning')
        await act(async () => {
          if (completion === 'reject') pending.reject(new Error('late failure'));
          else pending.resolve({ data: { items: [{ id: 'late-agent' }] } });
        });
      expectRequestReleased();
      commitChat();
      expectRequestReleased();
      expect(mockSetParams).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    },
  );

  test('a prevented pop expires across unchanged commits and cannot fire on a later return', async () => {
    jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] });
    mockPage = ['settings', 'about', 'diagnostics'];
    mockContentStack = { key: 'main', index: 1 };
    mockIsChatFocused = false;
    render();
    act(() => mockActions.startNewChat());
    for (let i = 0; i < 3; i++) act(() => renderer.update(<Sidebar navigation={navigation} />));
    act(() => jest.advanceTimersByTime(1501));
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockSetParams).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    commitChat();
    await act(async () => {});
    expect(mockSetParams).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test.each([false, true])(
    'resolution expires with an outstanding refetch/session (sessionPending=%s)',
    async (sessionPending) => {
      jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] });
      const pending = Promise.withResolvers<{ data: { items: { id: string }[] } }>();
      mockPage = ['plugins'];
      mockContentStack = { key: 'main', index: 1 };
      mockIsChatFocused = false;
      mockLocalChat = { kind: 'session', sessionId: 'covered-session' };
      mockIsLoading = true;
      mockSessionIsLoading = false;
      mockRefetch.mockReturnValue(pending.promise);
      render();
      act(() => mockActions.startNewChat());
      act(() => jest.advanceTimersByTime(1000));
      commitChat();
      expect(mockRefetch).toHaveBeenCalledTimes(1);
      mockSessionIsLoading = sessionPending;
      act(() => renderer.update(<Sidebar navigation={navigation} />));
      if (sessionPending) await act(async () => pending.resolve({ data: { items: mockAgents } }));
      // Crossing the return deadline must allow a legitimate in-flight resolution.
      act(() => jest.advanceTimersByTime(501));
      expect(mockSetParams).not.toHaveBeenCalled();
      act(() => jest.advanceTimersByTime(14500));
      // Expiry clears the request's timer even if the uncancellable query never settles.
      expect(jest.getTimerCount()).toBe(0);
      mockSessionIsLoading = false;
      act(() => renderer.update(<Sidebar navigation={navigation} />));
      await act(async () => pending.resolve({ data: { items: mockAgents } }));
      expect(mockSetParams).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
      // A fresh tap remains usable after abandoning the previous generation.
      mockIsLoading = false;
      act(() => renderer.update(<Sidebar navigation={navigation} />));
      await act(async () => mockActions.startNewChat());
      expectEmptyDraft('current-agent');
      expect(jest.getTimerCount()).toBe(0);
    },
  );

  test.each(['session-first', 'agents-first'])(
    'uses the latest settled session agent when %s resolves',
    async (order) => {
      const pending = Promise.withResolvers<{ data: { items: { id: string }[] } }>();
      mockLocalChat = { kind: 'session', sessionId: 'covered-session' };
      mockSessionAgentId = undefined;
      mockSessionIsLoading = true;
      mockIsLoading = true;
      mockAgents = [{ id: 'first-agent' }];
      const settledAgents = [{ id: 'first-agent' }, { id: 'current-agent' }];
      mockRefetch.mockReturnValue(pending.promise);
      render();
      await act(async () => mockActions.startNewChat());
      if (order === 'agents-first') {
        act(() => mockPublishAgents(settledAgents));
        expect(mockRefetch).not.toHaveBeenCalled();
        expect(mockSetParams).not.toHaveBeenCalled();
        expect(mockPush).not.toHaveBeenCalled();
        expect(mockReplace).not.toHaveBeenCalled();
      }
      mockSessionAgentId = 'current-agent';
      mockSessionIsLoading = false;
      act(() => renderer.update(<Sidebar navigation={navigation} />));
      await act(async () => pending.resolve({ data: { items: settledAgents } }));
      expectEmptyDraft('current-agent');
      expect(mockRefetch).toHaveBeenCalledTimes(order === 'agents-first' ? 0 : 1);
    },
  );

  test('an unchanged commit while resolving starts one refetch and completes one draft', async () => {
    const pending = Promise.withResolvers<{ data: { items: { id: string }[] } }>();
    mockIsLoading = true;
    mockRefetch.mockReturnValue(pending.promise);
    render();
    await act(async () => mockActions.startNewChat());
    for (let i = 0; i < 10; i++) act(() => renderer.update(<Sidebar navigation={navigation} />));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ data: { items: mockAgents } }));
    expectEmptyDraft('first-agent');
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test.each(
    [
      'destination',
      'conversation',
      'source',
      'connection',
      'leaf',
      'navigator',
      'departure',
      'params',
      'unmount',
    ].flatMap(
      (change) =>
        [
          [change, []],
          [change, [{ id: 'current-agent' }]],
        ] as const,
    ),
  )('a %s change cancels a resolving refetch with agents=%j', async (change, items) => {
    const pending = Promise.withResolvers<{ data: { items: { id: string }[] } }>();
    mockIsLoading = true;
    mockRefetch.mockReturnValue(pending.promise);
    mockLocalChat = { kind: 'draft', agentId: 'current-agent' };
    render();
    await act(async () => mockActions.startNewChat());
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    act(() => {
      if (change === 'destination') {
        mockPage = ['plugins'];
        mockIsChatFocused = false;
        mockContentStack = { key: 'main', index: 1 };
      }
      if (change === 'conversation') mockLocalChat = { kind: 'session', sessionId: 'other' };
      if (change === 'source') mockSource = 'remote';
      if (change === 'connection') mockRemoteTarget = { connectionId: 'other' };
      if (change === 'leaf') mockLeafKey = 'replacement';
      if (change === 'navigator') mockContentStack = { key: 'replacement', index: 0 };
      if (change === 'departure')
        mockRootOverride = { key: 'root', index: 0, routes: [{ key: 'outside', name: 'login' }] };
      if (change === 'params') mockParams = { messageId: 'new-message' };
      if (change === 'unmount') renderer.unmount();
      else renderer.update(<Sidebar navigation={navigation} />);
    });
    await act(async () => pending.resolve({ data: { items: [...items] } }));
    expect(mockSetParams).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test.each([
    'returnToChat',
    'closeDrawer',
    'openSearch',
    'openLibrary',
    'openSettings',
    'prepareExternalNavigation',
  ] as const)('%s immediately cancels an outstanding request', async (action) => {
    const pending = Promise.withResolvers<{ data: { items: { id: string }[] } }>();
    mockIsLoading = true;
    mockRefetch.mockReturnValue(pending.promise);
    render();
    await act(async () => mockActions.startNewChat());
    await act(async () => {
      if (action === 'prepareExternalNavigation')
        await mockActions[action](new AbortController().signal);
      else mockActions[action]?.();
    });
    mockPush.mockClear();
    mockReplace.mockClear();
    await act(async () => pending.resolve({ data: { items: [{ id: 'late-agent' }] } }));
    expect(mockSetParams).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test.each([false, true])(
    'repeated taps survive older refetch completion (rejected=%s) and effect replay exactly once',
    async (rejected) => {
      const first = Promise.withResolvers<{ data: { items: { id: string }[] } }>();
      const second = Promise.withResolvers<{ data: { items: { id: string }[] } }>();
      mockIsLoading = true;
      mockRefetch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      act(() => {
        renderer = create(
          <StrictMode>
            <Sidebar navigation={navigation} />
          </StrictMode>,
        );
      });
      await act(async () => mockActions.startNewChat());
      await act(async () => mockActions.startNewChat());
      expect(mockRefetch).toHaveBeenCalledTimes(2);
      await act(async () => {
        if (rejected) first.reject(new Error('obsolete request'));
        else first.resolve({ data: { items: [] } });
      });
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockSetParams).not.toHaveBeenCalled();
      await act(async () => second.resolve({ data: { items: [{ id: 'survivor' }] } }));
      expectEmptyDraft('survivor');
      expect(mockPush).not.toHaveBeenCalled();
    },
  );

  test('refetch rejection clears only that request and permits another tap', async () => {
    mockIsLoading = true;
    mockRefetch.mockRejectedValueOnce(new Error('unavailable'));
    render();
    await act(async () => mockActions.startNewChat());
    expect(mockSetParams).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    mockRefetch.mockResolvedValueOnce({ data: { items: [{ id: 'retry' }] } });
    await act(async () => mockActions.startNewChat());
    expectEmptyDraft('retry');
  });

  test.each([
    'destination',
    'params',
    'conversation',
    'leaf',
    'navigator',
    'source',
    'departure',
  ] as const)(
    'a returning request cannot survive a conflicting %s then a chat commit',
    async (change) => {
      mockPage = ['plugins'];
      mockContentStack = { key: 'main', index: 1 };
      mockIsChatFocused = false;
      mockLocalChat = { kind: 'draft', agentId: 'current-agent' };
      render();
      act(() => mockActions.startNewChat());
      act(() => {
        if (change === 'destination') mockPage = ['skills'];
        if (change === 'params') mockParams = { sessionId: 'conflicting' };
        if (change === 'conversation') mockLocalChat = { kind: 'session', sessionId: 'other' };
        if (change === 'leaf') mockLeafKey = 'replacement';
        if (change === 'navigator') mockContentStack = { key: 'replacement', index: 1 };
        if (change === 'source') mockSource = 'remote';
        if (change === 'departure')
          mockRootOverride = { key: 'root', index: 0, routes: [{ key: 'outside', name: 'login' }] };
        renderer.update(<Sidebar navigation={navigation} />);
      });
      mockRootOverride = undefined;
      commitChat();
      await act(async () => {});
      expect(mockSetParams).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockStartRemoteChat).not.toHaveBeenCalled();
    },
  );

  test('remote waits for matching remote focus and uses the committed callback with zero arguments', async () => {
    mockSource = 'remote';
    mockRemoteTarget = {
      connectionId: 'desktop',
      agentId: 'remote-agent',
      sessionId: 'old-session',
    };
    mockPage = ['settings'];
    mockContentStack = { key: 'main', index: 1 };
    mockIsChatFocused = false;
    mockNestedChatIndex = 1;
    const prePopCallback = jest.fn();
    mockRemoteCallback = prePopCallback;
    render();
    act(() => mockActions.startNewChat());
    expect(mockStartRemoteChat).not.toHaveBeenCalled();
    // The pop state alone does not prove that segments/source focus have committed.
    mockContentStack = { key: 'main', index: 0 };
    act(() => renderer.update(<Sidebar navigation={navigation} />));
    expect(mockStartRemoteChat).not.toHaveBeenCalled();
    mockRemoteCallback = mockStartRemoteChat;
    commitChat();
    await act(async () => {});
    expect(prePopCallback).not.toHaveBeenCalled();
    expect(mockStartRemoteChat.mock.calls).toEqual([[]]);
    expect(mockSetParams).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockRefetch).not.toHaveBeenCalled();
  });

  test('a remote connection change while returning prevents any remote draft', async () => {
    mockSource = 'remote';
    mockRemoteTarget = { connectionId: 'desktop' };
    mockPage = ['plugins'];
    mockContentStack = { key: 'main', index: 1 };
    mockIsChatFocused = false;
    render();
    act(() => mockActions.startNewChat());
    mockRemoteTarget = { connectionId: 'other-desktop' };
    commitChat();
    await act(async () => {});
    expect(mockStartRemoteChat).not.toHaveBeenCalled();
    expect(mockSetParams).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
