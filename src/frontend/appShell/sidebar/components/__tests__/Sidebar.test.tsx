import type { ComponentProps, ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AppSearchOutcome } from '@/frontend/appShell/search';

import type { SidebarActions } from '../../context';
import type { SessionSearchResult } from '../../hooks/sessionSearch';
import { DockedSidebar, Sidebar } from '../Sidebar';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
const mockNavigate = jest.fn();
const mockCloseDrawer = jest.fn();
const mockCancelPending = jest.fn();
const mockWaitForClose = jest.fn(async () => true);
const mockDispatch = jest.fn();
const mockOpenSessionSearch = jest.fn<Promise<AppSearchOutcome<SessionSearchResult>>, []>();
const mockSetContent = jest.fn();
let mockConnectionId: string | undefined;
let mockSource: 'local' | 'remote' = 'local';
let mockCanDock = false;
let mockPage = ['(chat)'];
let mockParams: Record<string, string> = {};
let mockContentStack: { index: number; key: string } | undefined;
let mockActions: SidebarActions;

jest.mock('expo-router', () => ({
  useSegments: () =>
    mockPage[0] === 'settings'
      ? ['(drawer)', ...mockPage]
      : ['(drawer)', '(content)', '(main)', ...mockPage],
  useGlobalSearchParams: () => mockParams,
  useRouter: () => ({
    dismissTo: mockDismissTo,
    navigate: mockNavigate,
    push: mockPush,
    replace: mockReplace,
  }),
}));

jest.mock('expo-router/drawer', () => ({ useDrawerStatus: () => 'open' }));

jest.mock('expo-router/react-navigation', () => ({
  StackActions: { popToTop: () => ({ type: 'POP_TO_TOP' }) },
}));

jest.mock('uniwind', () => ({ useUniwind: () => ({ theme: 'light' }) }));
jest.mock('@/frontend/hooks/useThemeColor', () => ({
  useThemeColor: (tokens: string | string[]) => tokens,
}));

jest.mock('@/frontend/appShell/navigation/chat', () => ({
  useConversationTarget: () => ({}),
  chatHref: ({ sessionId }: { sessionId: string }) => ({ pathname: '/', params: { sessionId } }),
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
jest.mock('@/frontend/appShell/search', () => ({
  useAppSearch: () => ({ open: mockOpenSessionSearch }),
}));
jest.mock('../../hooks/useSessionSearch', () => ({
  ...jest.requireActual('../../hooks/useSessionSearch'),
  useSessionSearchRequest: () => ({}),
}));
jest.mock('@/frontend/components/EmptyIllustration', () => ({ EmptyIllustration: () => null }));
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
    mockOpenSessionSearch.mockResolvedValue({ type: 'cancelled' });
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

  const sidebar = (searchPanel?: ComponentProps<typeof Sidebar>['searchPanel']) =>
    mockCanDock ? (
      <DockedSidebar searchPanel={searchPanel} />
    ) : (
      <Sidebar navigation={navigation} searchPanel={searchPanel} />
    );

  function render(searchPanel?: ComponentProps<typeof Sidebar>['searchPanel']) {
    act(() => {
      renderer = create(sidebar(searchPanel));
    });
  }

  test('opens scheduled tasks on the main stack and pushes Settings above it', () => {
    mockConnectionId = 'desktop';
    mockContentStack = { index: 1, key: 'main' };
    render();

    act(() => mockActions.openScheduledTasks());
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/scheduled-tasks/[connectionId]',
      params: { connectionId: 'desktop' },
    });

    act(() => mockActions.openSettings());
    expect(mockPush).toHaveBeenCalledWith('/settings');
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
    expect(mockDismissTo).toHaveBeenCalledWith('/settings');
  });

  test('opens scheduled tasks for a changed connection on the same route', async () => {
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

  test.each([
    { destination: ['(chat)'], params: { sessionId: 'previous' }, closes: false },
    { destination: ['(chat)', 'remote'], params: { connectionId: 'desktop' }, closes: true },
    { destination: ['(chat)'], params: { sessionId: 'from-notification' }, closes: true },
  ])(
    'restores or closes the drawer based on the destination after Settings: %o',
    ({ destination, params, closes }) => {
      mockParams = { sessionId: 'previous' };
      render();
      act(() => mockActions.openSettings());

      expect(mockCloseDrawer).not.toHaveBeenCalled();
      expect(mockCancelPending).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/settings');
      expect(mockWaitForClose).not.toHaveBeenCalled();

      mockPage = ['settings', 'profile'];
      mockParams = {};
      act(() => renderer.update(sidebar()));
      expect(mockCloseDrawer).not.toHaveBeenCalled();

      mockPage = destination;
      mockParams = Object.fromEntries(
        Object.entries(params).filter((entry): entry is [string, string] => entry[1] !== undefined),
      );
      act(() => renderer.update(sidebar()));
      expect(mockCloseDrawer).toHaveBeenCalledTimes(closes ? 1 : 0);
    },
  );

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

  test('opens local search in the permanent sidebar column', () => {
    mockCanDock = true;
    render(() => null);
    act(() => mockActions.openSearch?.());
    expect(mockSetContent).toHaveBeenCalledWith('search');
    expect(mockOpenSessionSearch).not.toHaveBeenCalled();
  });

  test('keeps the compact drawer open while search is open and after cancellation', async () => {
    const search = Promise.withResolvers<AppSearchOutcome<SessionSearchResult>>();
    mockOpenSessionSearch.mockReturnValueOnce(search.promise);
    render();
    act(() => mockActions.openSearch?.());

    expect(mockCancelPending).toHaveBeenCalledTimes(1);
    expect(mockOpenSessionSearch).toHaveBeenCalledTimes(1);
    expect(mockCloseDrawer).not.toHaveBeenCalled();

    mockPage = ['search'];
    act(() => renderer.update(sidebar()));
    mockPage = ['(chat)'];
    await act(async () => {
      renderer.update(sidebar());
      search.resolve({ type: 'cancelled' });
    });
    expect(mockCloseDrawer).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('closes the drawer and opens the selected session after search resolves', async () => {
    const search = Promise.withResolvers<AppSearchOutcome<SessionSearchResult>>();
    mockOpenSessionSearch.mockReturnValueOnce(search.promise);
    mockContentStack = { index: 1, key: 'main' };
    render();
    act(() => mockActions.openSearch?.());
    expect(mockCloseDrawer).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();

    await act(async () =>
      search.resolve({
        type: 'selected',
        item: { kind: 'session', item: { id: 'found' } as never },
      }),
    );
    expect(mockCloseDrawer).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith({ target: 'main', type: 'POP_TO_TOP' });
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/', params: { sessionId: 'found' } });
    expect(mockCloseDrawer.mock.invocationCallOrder[0]).toBeLessThan(
      mockNavigate.mock.invocationCallOrder[0],
    );
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
