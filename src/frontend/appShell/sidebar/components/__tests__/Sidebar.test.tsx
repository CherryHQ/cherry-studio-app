import type { ComponentProps, ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { SidebarActions } from '../../context';
import { Sidebar } from '../Sidebar';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockCloseDrawer = jest.fn();
const mockCancelPending = jest.fn();
const mockWaitForClose = jest.fn(async () => true);
const mockDispatch = jest.fn();
const mockOpenSessionSearch = jest.fn();
const mockSetContent = jest.fn();
let mockConnectionId: string | undefined;
let mockSource: 'local' | 'remote' = 'local';
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
  useConversationTarget: () => ({}),
  useChatSource: () => ({
    source: mockSource,
    remoteTarget: { connectionId: mockConnectionId },
    viewMode: 'sessions',
  }),
}));

jest.mock('@/frontend/appShell/layout', () => ({ useCanDockSidebar: () => mockCanDock }));
jest.mock('../../SidebarColumn', () => ({
  useSidebarColumn: () => ({
    column: { kind: mockCanDock ? 'permanent' : 'overlay' },
    setContent: mockSetContent,
  }),
}));
jest.mock('../../hooks/useSessionSearch', () => ({
  sessionSearchResultHref: jest.fn(),
  useSessionSearch: () => mockOpenSessionSearch,
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
    mockConnectionId = undefined;
    mockCanDock = false;
    mockPage = ['(chat)'];
    mockParams = {};
    mockContentStack = { index: 0, key: 'main' };
  });

  afterEach(() => {
    act(() => renderer?.unmount());
  });

  function render(searchPanel?: ComponentProps<typeof Sidebar>['searchPanel']) {
    act(() => {
      renderer = create(<Sidebar navigation={navigation} searchPanel={searchPanel} />);
    });
  }

  test('opens a destination above the chat and swaps it for another destination', async () => {
    mockConnectionId = 'desktop';
    render();
    await act(async () => mockActions.openSettings());
    expect(mockPush).toHaveBeenCalledWith('/settings');

    mockContentStack = { index: 1, key: 'main' };
    await act(async () => mockActions.openScheduledTasks());
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/scheduled-tasks/[connectionId]',
      params: { connectionId: 'desktop' },
    });

    await act(async () => mockActions.openSettings());
    expect(mockReplace).toHaveBeenLastCalledWith('/settings');
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  test.each([true, false])(
    'reselecting the visible Settings page keeps its screen (wide=%s)',
    async (wide) => {
      mockCanDock = wide;
      mockPage = ['settings'];
      mockContentStack = { index: 1, key: 'main' };
      render();

      await act(async () => mockActions.openSettings());
      await act(async () => mockActions.openSettings());
      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    },
  );

  test.each([true, false])(
    'reselecting scheduled tasks for the same connection keeps its screen (wide=%s)',
    async (wide) => {
      mockCanDock = wide;
      mockConnectionId = 'desktop';
      mockPage = ['scheduled-tasks', '[connectionId]'];
      mockParams = { connectionId: 'desktop' };
      mockContentStack = { index: 1, key: 'main' };
      render();

      await act(async () => mockActions.openScheduledTasks());
      await act(async () => mockActions.openScheduledTasks());

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

  test('opens scheduled tasks for a changed connection on the same route', async () => {
    mockCanDock = true;
    mockConnectionId = 'new-connection';
    mockPage = ['scheduled-tasks', '[connectionId]'];
    mockParams = { connectionId: 'previous-connection' };
    mockContentStack = { index: 1, key: 'main' };
    render();

    await act(async () => mockActions.openScheduledTasks());
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/scheduled-tasks/[connectionId]',
      params: { connectionId: 'new-connection' },
    });
  });

  test('keeps the current page when no scheduled-task connection is selected', () => {
    render();

    act(() => mockActions.openScheduledTasks());

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockCloseDrawer).not.toHaveBeenCalled();
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

    expect(mockCloseDrawer).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith({ target: 'main', type: 'POP_TO_TOP' });
  });

  test('returns to the chat while leaving the overlay open', () => {
    mockContentStack = { index: 2, key: 'main' };
    render();

    act(() => mockActions.returnToChat());

    expect(mockCancelPending).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith({ target: 'main', type: 'POP_TO_TOP' });
    expect(mockCloseDrawer).not.toHaveBeenCalled();
  });

  test.each([true, false])('opens local search in the expected region (wide=%s)', (wide) => {
    mockCanDock = wide;
    render(() => null);
    mockCloseDrawer.mockClear();

    act(() => mockActions.openSearch?.());

    expect(mockCancelPending).toHaveBeenCalledTimes(1);
    expect(mockCloseDrawer).toHaveBeenCalledTimes(1);
    if (wide) {
      expect(mockSetContent).toHaveBeenCalledWith('search');
      expect(mockOpenSessionSearch).not.toHaveBeenCalled();
    } else {
      expect(mockOpenSessionSearch).toHaveBeenCalledTimes(1);
      expect(mockSetContent).not.toHaveBeenCalled();
    }
  });

  test('does not offer local search for a remote source', () => {
    mockSource = 'remote';
    render();

    expect(mockActions.openSearch).toBeUndefined();
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
});
