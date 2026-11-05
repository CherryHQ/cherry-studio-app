import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { DesktopLiveStatus } from '@/shared/contracts/desktopConnections';
import type { DesktopConnection } from '@/shared/data/types/desktopConnection';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockDismissTo = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    dismissTo: mockDismissTo,
  }),
  useLocalSearchParams: () => ({ connectionId: 'conn-1' }),
  useNavigation: () => ({ dispatch: jest.fn(), openDrawer: jest.fn(), closeDrawer: jest.fn() }),
  useNavigationState: () => 0,
  usePathname: () => '/settings/device-connections/conn-1',
}));

jest.mock('@/frontend/appShell/header', () => ({
  RouteHeader: () => null,
}));

jest.mock('@cherrystudio/ui/utils', () => ({
  cn: (...classes: unknown[]) => classes.flat().filter(Boolean).join(' '),
}));

const mockAlertConfirm = jest.fn();
const mockAlertShow = jest.fn();

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
    ContentState: {
      Loading: (props: any) => React.createElement('Loading', props),
      Error: (props: any) => React.createElement('Error', props),
      Empty: (props: any) => React.createElement('Empty', props),
      Icon: (props: any) => React.createElement('Icon', props, props.children),
    },
    Section: Object.assign(
      (props: { children?: React.ReactNode; footer?: React.ReactNode }) =>
        React.createElement('Section', props, props.children),
      {
        Item: (props: any) => React.createElement('SectionItem', props),
      },
    ),
    useAlert: () => ({
      alert: {
        confirm: mockAlertConfirm,
        show: mockAlertShow,
      },
    }),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
  }),
}));

const mockConnection: DesktopConnection = {
  id: 'conn-1',
  name: 'MacBook-Pro',
  profileName: 'Alice',
  profileAvatar: '🦊',
  status: 'paired',
  capabilities: ['agent', 'configuration'],
  configuredEndpoints: [],
  lastFetchedAt: null,
};

let mockCurrentLiveStatus: DesktopLiveStatus = { state: 'connected' };

const mockDisconnect = jest.fn();
const mockReconnect = jest.fn();
const mockRemove = jest.fn(async () => true);

jest.mock('@/frontend/hooks/useDesktopConnections', () => ({
  useDesktopConnection: () => ({
    connection: mockConnection,
    error: null,
    isLoading: false,
    refetch: jest.fn(),
  }),
  useDesktopConnectionActions: () => ({
    disconnect: mockDisconnect,
    reconnect: mockReconnect,
    remove: mockRemove,
    isRemoving: false,
  }),
}));

jest.mock('@/frontend/hooks/useDesktopConnectionLiveStatus', () => ({
  useDesktopConnectionLiveStatus: () => mockCurrentLiveStatus,
}));

jest.mock('@/frontend/data', () => ({
  queryKeys: {
    uuRemote: {
      binding: () => ['uuRemote', 'binding'],
    },
  },
  useBackendModule: () => ({
    getBinding: jest.fn(async () => null),
  }),
}));

jest.mock('@/frontend/appShell/uuRemote', () => ({
  useUuRemoteAction: () => ({
    isOpening: false,
    open: jest.fn(),
    bind: jest.fn(),
  }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: null,
    isPending: false,
    isError: false,
  }),
}));

import { DeviceConnectionDetailScreen } from '../DeviceConnectionDetailScreen';

describe('DeviceConnectionDetailScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentLiveStatus = { state: 'connected' };
  });

  afterEach(async () => {
    if (renderer) {
      await act(async () => {
        renderer?.unmount();
      });
      renderer = undefined;
    }
  });

  it('renders desktop identity and disconnect control when connected', async () => {
    mockCurrentLiveStatus = { state: 'connected' };
    await act(async () => {
      renderer = create(<DeviceConnectionDetailScreen />);
    });

    const items = renderer!.root.findAllByType('SectionItem' as never);
    const disconnectItem = items.find((item) => item.props.label === 'Disconnect');
    expect(disconnectItem).toBeDefined();

    act(() => {
      disconnectItem!.props.onPress();
    });
    expect(mockDisconnect).toHaveBeenCalledWith('conn-1');
  });

  it('renders reconnect control when disconnected', async () => {
    mockCurrentLiveStatus = { state: 'disconnected' };
    await act(async () => {
      renderer = create(<DeviceConnectionDetailScreen />);
    });

    const items = renderer!.root.findAllByType('SectionItem' as never);
    const reconnectItem = items.find((item) => item.props.label === 'Reconnect');
    expect(reconnectItem).toBeDefined();

    act(() => {
      reconnectItem!.props.onPress();
    });
    expect(mockReconnect).toHaveBeenCalledWith('conn-1');
  });

  it('renders retry and diagnostics when unreachable with failure evidence', async () => {
    mockCurrentLiveStatus = {
      state: 'unreachable',
      reason: 'unreachable',
      failures: [
        {
          address: '192.168.1.50:23333',
          kind: 'websocket',
          closeCode: 1006,
          message: "Expected HTTP 101 response but was '401 Unauthorized'",
        },
      ],
    };
    await act(async () => {
      renderer = create(<DeviceConnectionDetailScreen />);
    });

    const items = renderer!.root.findAllByType('SectionItem' as never);
    const retryItem = items.find((item) => item.props.label === 'Retry Connection');
    expect(retryItem).toBeDefined();

    // Capability items should be disabled with offline notice
    const chatItem = items.find(
      (item) => item.props.label === 'settings.deviceConnections.openHome',
    );
    expect(chatItem?.props.disabled).toBe(true);
    expect(chatItem?.props.description).toContain('offline');
  });
});
