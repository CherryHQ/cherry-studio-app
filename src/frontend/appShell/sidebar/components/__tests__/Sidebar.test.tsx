import type { ComponentProps, ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ChatTarget } from '@/frontend/appShell/navigation/chat';

import type { SidebarActions } from '../../context';
import { Sidebar } from '../Sidebar';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockCloseDrawer = jest.fn();
const mockCancelPending = jest.fn();
const mockWaitForClose = jest.fn(async () => true);
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
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

jest.mock('expo-router/react-navigation', () => ({
  StackActions: { popToTop: () => ({ type: 'POP_TO_TOP' }) },
}));

jest.mock('uniwind', () => ({ useUniwind: () => ({ theme: 'light' }) }));
jest.mock('@/frontend/hooks/useThemeColor', () => ({ useThemeColor: () => '#fff' }));

jest.mock('@/frontend/appShell/navigation/chat', () => ({
  ...jest.requireActual('@/frontend/appShell/navigation/chat/chatRoute'),
  useConversationTarget: () => ({}),
  useChatSource: () => ({
    localChat: mockLocalChat,
    source: mockSource,
    remoteTarget: {},
    viewMode: 'sessions',
    startRemoteChat: jest.fn(),
  }),
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
    mockLocalChat = undefined;
    mockPaneAvailable = false;
    mockCanDock = false;
    mockPage = ['(chat)'];
    mockParams = {};
    mockContentStack = { index: 0, key: 'main' };
  });

  afterEach(() => {
    act(() => renderer?.unmount());
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

  test('opens Settings immediately when dismissing a compact drawer', () => {
    render();

    act(() => {
      mockActions.openSettings();
    });

    expect(mockCloseDrawer).toHaveBeenCalledTimes(1);
    expect(mockCancelPending).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/settings');
    expect(mockWaitForClose).not.toHaveBeenCalled();
  });

  test('brings the chat back in front of a destination before opening a conversation', () => {
    mockContentStack = { index: 2, key: 'main' };
    render();

    act(() => mockActions.closeDrawer());

    expect(mockDispatch).toHaveBeenCalledWith({ target: 'main', type: 'POP_TO_TOP' });
  });

  test.each(['recent conversation', 'search', 'incoming link'])(
    'a newer %s supersedes an external launch while the drawer is closing',
    async (next) => {
      render();
      const closed = Promise.withResolvers<boolean>();
      mockWaitForClose.mockReturnValueOnce(closed.promise);
      mockCancelPending.mockImplementationOnce(() => closed.resolve(false));

      const ready = mockActions.prepareExternalNavigation(new AbortController().signal);
      act(() => {
        if (next === 'recent conversation') mockActions.closeDrawer();
        else if (next === 'search') mockActions.openSearch?.();
        else {
          mockParams = { sessionId: 'notification-session' };
          renderer.update(<Sidebar navigation={navigation} />);
        }
      });
      closed.resolve(true);
      await expect(ready).resolves.toBe(false);
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
});
