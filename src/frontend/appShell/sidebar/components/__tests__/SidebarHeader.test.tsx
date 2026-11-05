import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { DesktopConnection } from '@/shared/data/types/desktopConnection';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@cherrystudio/ui/motion', () => ({
  duration: { base: 1, fast: 1 },
  easing: { settle: undefined, linear: undefined },
}));

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react');
  return {
    __esModule: true,
    default: {
      View: (props: any) => React.createElement('View', props, props.children),
    },
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => false,
    useSharedValue: (val: any) => ({ value: val }),
    withDelay: (_delay: any, anim: any) => anim,
    withTiming: (toVal: any) => toVal,
    cancelAnimation: jest.fn(),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
}));

jest.mock('@cherrystudio/ui/utils', () => ({
  cn: (...classes: unknown[]) => classes.flat().filter(Boolean).join(' '),
}));

let mockItems: any[] = [];
jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  const Avatar = Object.assign(
    (props: { children?: React.ReactNode }) => React.createElement('Avatar', props, props.children),
    {
      Fallback: (props: any) => React.createElement('AvatarFallback', props, props.children),
      Image: (props: any) => React.createElement('AvatarImage', props),
    },
  );
  return {
    Avatar,
    ActionMenu: ({ children, items }: any) => {
      mockItems = items;
      return React.createElement('ActionMenu', { items }, children);
    },
    Surface: ({ children }: any) => children,
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: { name?: string }) =>
      key === 'navigation.deviceSwitcher' ? `Switch ${params?.name}` : key,
  }),
}));

let mockChatSource = {
  source: 'local' as 'local' | 'remote',
  remoteTarget: { connectionId: 'desktop-a' },
  selectDevice: jest.fn(),
};

jest.mock('@/frontend/appShell/navigation/chat', () => ({
  useChatSource: () => mockChatSource,
}));

let mockConnections: DesktopConnection[] = [];

jest.mock('@/frontend/hooks/useDesktopConnections', () => ({
  useDesktopConnections: () => ({
    connections: mockConnections,
    error: null,
    isLoading: false,
    refetch: jest.fn(),
  }),
}));

jest.mock('@/frontend/appShell/uuRemote', () => ({
  useUuRemoteAction: () => ({
    isOpening: false,
    open: jest.fn(),
  }),
}));

jest.mock('../../context', () => ({
  useSidebarActions: () => ({
    closeDrawer: jest.fn(),
    openSearch: jest.fn(),
    prepareExternalNavigation: jest.fn(),
    returnToChat: jest.fn(),
  }),
}));

jest.mock('../../hooks/useSidebarHeaderTop', () => ({
  useSidebarHeaderTop: () => 0,
}));

jest.mock('../../hooks/useSidebarPresence', () => ({
  useSidebarPresence: () => 'open',
}));

jest.mock('../../SidebarSelectionProvider', () => ({
  useSidebarSelectionSnapshot: (fn: any) => fn({ isSelecting: false, isDeleting: false }),
}));

import { SidebarHeader } from '../SidebarHeader';

describe('SidebarHeader and device switcher', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockItems = [];
    mockConnections = [];
    mockChatSource = {
      source: 'local',
      remoteTarget: { connectionId: 'desktop-a' },
      selectDevice: jest.fn(),
    };
  });

  afterEach(async () => {
    if (renderer) {
      await act(async () => {
        renderer?.unmount();
      });
      renderer = undefined;
    }
  });

  it('renders default brand title when no desktops are paired', async () => {
    await act(async () => {
      renderer = create(<SidebarHeader />);
    });

    const switcher = renderer!.root.findAllByProps({ testID: 'sidebar-device-switcher' });
    expect(switcher.length).toBe(0);
  });

  it('renders desktop profile name and avatar when remote desktop is active, without leaking to other desktop', async () => {
    mockConnections = [
      {
        id: 'desktop-a',
        name: 'MacBook-Pro',
        profileName: 'Alice Mac',
        profileAvatar: '🦊',
        status: 'paired',
        capabilities: ['agent'],
        configuredEndpoints: [],
        lastFetchedAt: null,
      },
      {
        id: 'desktop-b',
        name: 'Work-Tower',
        profileName: null,
        profileAvatar: null,
        status: 'paired',
        capabilities: ['agent'],
        configuredEndpoints: [],
        lastFetchedAt: null,
      },
    ];
    mockChatSource = {
      source: 'remote',
      remoteTarget: { connectionId: 'desktop-a' },
      selectDevice: jest.fn(),
    };

    await act(async () => {
      renderer = create(<SidebarHeader />);
    });

    const switcher = renderer!.root.findByProps({ testID: 'sidebar-device-switcher' });
    expect(switcher.props.accessibilityLabel).toBe('Switch Alice Mac');

    // Switch to desktop B
    mockChatSource = {
      source: 'remote',
      remoteTarget: { connectionId: 'desktop-b' },
      selectDevice: jest.fn(),
    };

    await act(async () => {
      renderer!.update(<SidebarHeader />);
    });

    const updatedSwitcher = renderer!.root.findByProps({ testID: 'sidebar-device-switcher' });
    // Desktop B has no profileName, so falls back to its own name 'Work-Tower', never leaking 'Alice Mac'
    expect(updatedSwitcher.props.accessibilityLabel).toBe('Switch Work-Tower');
  });

  it('formats menu items with profile name, emoji, and machine name', async () => {
    mockConnections = [
      {
        id: 'desktop-a',
        name: 'MacBook-Pro',
        profileName: 'Alice Mac',
        profileAvatar: '🦊',
        status: 'paired',
        capabilities: ['agent'],
        configuredEndpoints: [],
        lastFetchedAt: null,
      },
      {
        id: 'desktop-b',
        name: 'Work-Tower',
        profileName: null,
        profileAvatar: null,
        status: 'paired',
        capabilities: ['agent'],
        configuredEndpoints: [],
        lastFetchedAt: null,
      },
    ];

    await act(async () => {
      renderer = create(<SidebarHeader />);
    });

    const itemA = mockItems.find((i) => i.id === 'device-desktop-a');
    expect(itemA.label).toBe('🦊 Alice Mac (MacBook-Pro)');

    const itemB = mockItems.find((i) => i.id === 'device-desktop-b');
    expect(itemB.label).toBe('Work-Tower');
  });
});
