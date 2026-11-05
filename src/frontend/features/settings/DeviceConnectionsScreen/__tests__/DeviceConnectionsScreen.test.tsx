import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { DesktopLiveStatus } from '@/shared/contracts/desktopConnections';
import type { DesktopConnection } from '@/shared/data/types/desktopConnection';

jest.mock('@/frontend/appShell/header', () => ({
  RouteHeader: () => null,
}));

jest.mock('@cherrystudio/ui/utils', () => ({
  cn: (...classes: unknown[]) => classes.flat().filter(Boolean).join(' '),
}));

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
    Section: {
      Item: (props: any) => React.createElement('SectionItem', props),
    },
  };
});

import { DeviceConnectionsScreen } from '../DeviceConnectionsScreen';

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useNavigation: () => ({ dispatch: jest.fn(), openDrawer: jest.fn(), closeDrawer: jest.fn() }),
  useNavigationState: () => 0,
  usePathname: () => '/settings/device-connections',
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
  }),
}));

const mockConnections: DesktopConnection[] = [
  {
    id: 'conn-1',
    name: 'MacBook-Pro',
    profileName: 'Alice',
    profileAvatar: '🦊',
    status: 'paired',
    capabilities: ['agent', 'configuration'],
    configuredEndpoints: [],
    lastFetchedAt: null,
  },
  {
    id: 'conn-2',
    name: 'Work-Station',
    profileName: null,
    profileAvatar: null,
    status: 'paired',
    capabilities: ['agent'],
    configuredEndpoints: [],
    lastFetchedAt: null,
  },
];

let mockLiveStatuses: Record<string, DesktopLiveStatus> = {
  'conn-1': { state: 'connected' },
  'conn-2': { state: 'unreachable', reason: 'unreachable' },
};

jest.mock('@/frontend/hooks/useDesktopConnections', () => ({
  useDesktopConnections: () => ({
    connections: mockConnections,
    error: null,
    isLoading: false,
    refetch: jest.fn(),
  }),
}));

jest.mock('@/frontend/hooks/useDesktopConnectionLiveStatus', () => ({
  useDesktopConnectionLiveStatus: (id: string) =>
    mockLiveStatuses[id] ?? { state: 'unreachable', reason: 'no-location' },
}));

describe('DeviceConnectionsScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(async () => {
    if (renderer) {
      await act(async () => {
        renderer?.unmount();
      });
      renderer = undefined;
    }
  });

  it('renders connections with profile name, hostname, and dynamic live status', async () => {
    await act(async () => {
      renderer = create(<DeviceConnectionsScreen />);
    });

    const rows = renderer!.root.findAllByProps({ id: 'conn-1' });
    expect(rows.length).toBeGreaterThan(0);

    const firstRow = rows[0];
    // Uses profileName 'Alice' when available
    expect(firstRow.props.name).toBe('Alice');
    expect(firstRow.props.subtitle).toContain('MacBook-Pro');
    expect(firstRow.props.statusLabel).toBe('Connected');
    expect(firstRow.props.statusTone).toBe('success');

    const secondRow = renderer!.root.findAllByProps({ id: 'conn-2' })[0];
    // Falls back to machine name when profileName is null
    expect(secondRow.props.name).toBe('Work-Station');
    expect(secondRow.props.statusLabel).toBe('Offline');
    expect(secondRow.props.statusTone).toBe('default');
  });

  it('navigates to details on pressing a connection row', async () => {
    await act(async () => {
      renderer = create(<DeviceConnectionsScreen />);
    });

    const firstRow = renderer!.root.findAllByProps({ id: 'conn-1' })[0];
    act(() => {
      firstRow.props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith({
      params: { connectionId: 'conn-1' },
      pathname: '/settings/device-connections/[connectionId]',
    });
  });
});
