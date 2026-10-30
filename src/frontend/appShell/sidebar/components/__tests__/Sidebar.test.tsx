import type { ComponentProps, ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ChatTarget } from '@/frontend/appShell/navigation/chat';

import type { SidebarActions } from '../../context';
import { Sidebar } from '../Sidebar';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockCloseDrawer = jest.fn();
const mockDispatch = jest.fn();
const mockPaneOpen = jest.fn();
let mockLocalChat: ChatTarget | undefined;
let mockSource: 'local' | 'remote' = 'local';
let mockPaneAvailable = false;
let mockContentStack: { index: number; key: string } | undefined;
let mockActions: SidebarActions;

jest.mock('expo-router', () => ({
  usePathname: () => '/',
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
  useStartNewChat: () => jest.fn(),
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
jest.mock('@/frontend/appShell/layout', () => ({ useCanDockSidebar: () => false }));
jest.mock('../../SidebarColumn', () => ({
  useSidebarColumn: () => ({ column: { kind: 'overlay' }, setContent: jest.fn() }),
}));
jest.mock('../../hooks/useSessionSearch', () => ({
  sessionSearchResultHref: jest.fn(),
  useSessionSearch: () => jest.fn(),
  useSessionSearchRequest: () => ({}),
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
  ] as const)('carries the chat identity to Skills: %j', (chat, params) => {
    mockLocalChat = chat;
    render();

    act(() => mockActions.openSkills());

    expect(mockCloseDrawer).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/skills',
      params: { agentId: undefined, sessionId: undefined, ...params },
    });
  });

  test('opens a destination above the chat and swaps it for another destination', () => {
    render();
    act(() => mockActions.openPaintings());
    expect(mockPush).toHaveBeenCalledWith('/drawings');

    mockContentStack = { index: 1, key: 'main' };
    act(() => mockActions.navigateAgents());
    expect(mockReplace).toHaveBeenCalledWith('/agents');
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  test('brings the chat back in front of a destination before opening a conversation', () => {
    mockContentStack = { index: 2, key: 'main' };
    render();

    act(() => mockActions.closeDrawer());

    expect(mockDispatch).toHaveBeenCalledWith({ target: 'main', type: 'POP_TO_TOP' });
  });

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
  ] as const)('lets a %s chat receive files from the library page', (source, chat, params) => {
    mockSource = source;
    mockLocalChat = chat;
    render();

    act(() => mockActions.openLibrary());

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/library', params });
  });
});
