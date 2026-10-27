import type { ComponentProps, ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ChatRouteParamsInput } from '@/frontend/appShell/navigation/chat';

import type { SidebarActions } from '../../context';
import { Sidebar } from '../Sidebar';

const mockPush = jest.fn();
const mockCloseDrawer = jest.fn();
let mockParams: ChatRouteParamsInput = {};
let mockSource: 'local' | 'remote' = 'local';
let mockActions: SidebarActions;

jest.mock('expo-router', () => ({
  useGlobalSearchParams: () => mockParams,
  // The drawer layout has no chat identity in its own local route params.
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/frontend/appShell/navigation/chat', () => ({
  ...jest.requireActual('@/frontend/appShell/navigation/chat/chatRoute'),
  useStartNewChat: () => jest.fn(),
  useChatSource: () => ({
    source: mockSource,
    remoteTarget: {},
    viewMode: 'sessions',
    startRemoteChat: jest.fn(),
  }),
}));

jest.mock('@/frontend/appShell/layout', () => ({ useIsSidebarPersistent: () => false }));
jest.mock('../../hooks/useSessionSearch', () => ({ useSessionSearch: () => jest.fn() }));
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
} as unknown as ComponentProps<typeof Sidebar>['navigation'];

describe('sidebar Skill chat handoff', () => {
  let renderer: ReactTestRenderer;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSource = 'local';
    mockParams = {};
  });

  afterEach(() => {
    act(() => renderer?.unmount());
  });

  test.each([
    { agentId: 'selected-agent', sessionId: undefined },
    { agentId: undefined, sessionId: 'selected-session' },
  ])('carries the focused chat identity to Skills: %j', (params) => {
    mockParams = params;
    act(() => {
      renderer = create(<Sidebar navigation={navigation} />);
    });

    act(() => mockActions.openSkills());

    expect(mockCloseDrawer).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/skills', params });
  });

  test('uses the latest selected chat when the drawer remains mounted', () => {
    mockParams = { agentId: 'previous-agent' };
    act(() => {
      renderer = create(<Sidebar navigation={navigation} />);
    });
    mockParams = { sessionId: 'next-session' };
    act(() => renderer.update(<Sidebar navigation={navigation} />));

    act(() => mockActions.openSkills());

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/skills',
      params: { agentId: undefined, sessionId: 'next-session' },
    });
  });

  test.each([{ agentId: 'desktop-agent' }, { sessionId: 'desktop-session' }])(
    'does not pass desktop identities into local Skill management: %j',
    (params) => {
      mockSource = 'remote';
      mockParams = params;
      act(() => {
        renderer = create(<Sidebar navigation={navigation} />);
      });

      act(() => mockActions.openSkills());

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/skills',
        params: { agentId: undefined, sessionId: undefined },
      });
    },
  );

  test.each([
    ['local', { sourceChat: JSON.stringify({ sessionId: 'selected-session' }) }],
    ['remote', {}],
  ] as const)('lets a %s chat receive files from the library page', (source, params) => {
    mockSource = source;
    mockParams = { sessionId: 'selected-session' };
    act(() => {
      renderer = create(<Sidebar navigation={navigation} />);
    });

    act(() => mockActions.openLibrary());

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/library', params });
  });
});
