import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { PermissionMode } from '@/data/preference';

import PermissionDetailSettingsScreen from '../PermissionDetailScreen';

const mockSetMode = jest.fn(async (_mode: PermissionMode) => undefined);
const mockGetStatus = jest.fn(async () => 'denied');
const mockRequestPermission = jest.fn(async () => 'denied');
const mockOpenSettings = jest.fn(async () => undefined);
const mockRefresh = jest.fn(async () => undefined);
let mockPermission = 'health';
let mockMode: PermissionMode = 'never';
let mockPolicies = makePolicies();
let mockStatuses: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ permission: mockPermission }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('heroui-native/utils', () => ({
  cn: (...values: (string | null | undefined)[]) => values.filter(Boolean).join(' '),
}));
jest.mock('lucide-uniwind/png', () => ({
  CheckIcon: () => null,
  SettingsIcon: () => null,
}));
jest.mock('@/components/headers', () => ({ BackHeader: () => null }));
jest.mock('@/data/hooks', () => ({
  useAppPreference: () => [mockMode, mockSetMode],
}));
jest.mock('@/data/runtime', () => ({
  useDataServices: () => ({
    devicePermission: {
      getStatusForPreference: mockGetStatus,
      openSystemSettings: mockOpenSettings,
      requestForPreference: mockRequestPermission,
    },
  }),
}));
jest.mock('../usePermissionPolicies', () => ({
  usePermissionPolicies: () => mockPolicies,
}));
jest.mock('../usePermissionSystemStatuses', () => ({
  usePermissionSystemStatuses: () => ({ refresh: mockRefresh, statuses: mockStatuses }),
}));
jest.mock('../../components/SettingsSection', () => ({
  SettingsSection: ({
    items,
    title,
  }: {
    items: { onPress?: () => void; title: string }[];
    title?: string;
  }) => {
    const { Fragment } = jest.requireActual('react');
    const { Pressable: MockPressable, Text: MockText } = jest.requireActual('react-native');
    return (
      <Fragment>
        {title ? <MockText>{title}</MockText> : null}
        {items.map((item) => (
          <MockPressable accessibilityLabel={item.title} key={item.title} onPress={item.onPress}>
            <MockText>{item.title}</MockText>
          </MockPressable>
        ))}
      </Fragment>
    );
  },
}));

describe('PermissionDetailSettingsScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPermission = 'health';
    mockMode = 'never';
    mockPolicies = makePolicies();
    mockStatuses = {};
    mockGetStatus.mockResolvedValue('denied');
    mockRequestPermission.mockResolvedValue('denied');
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  test('renders one three-choice read group for Health', () => {
    renderScreen();

    expect(modeLabels()).toHaveLength(3);
    expect(texts()).toContain('settings.permissions.readAccess');
    expect(texts()).not.toContain('settings.permissions.writeAccess');
  });

  test('renders independent read and write groups for Calendar', () => {
    mockPermission = 'calendar';
    renderScreen();

    expect(modeLabels()).toHaveLength(6);
    expect(texts()).toContain('settings.permissions.readAccess');
    expect(texts()).toContain('settings.permissions.writeAccess');
  });

  test('keeps never when native authorization is denied', async () => {
    renderScreen();

    await pressRadio('settings.permissions.mode.ask');

    expect(mockRequestPermission).toHaveBeenCalledWith('permissions.health_read');
    expect(mockSetMode).not.toHaveBeenCalled();
  });

  test('stores ask after native authorization succeeds', async () => {
    mockRequestPermission.mockResolvedValue('granted');
    renderScreen();

    await pressRadio('settings.permissions.mode.ask');

    expect(mockSetMode).toHaveBeenCalledWith('ask');
    expect(mockRefresh).toHaveBeenCalled();
  });

  test('switches ask to always without another native request', async () => {
    mockMode = 'ask';
    renderScreen();

    await pressRadio('settings.permissions.mode.always');

    expect(mockGetStatus).not.toHaveBeenCalled();
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockSetMode).toHaveBeenCalledWith('always');
  });

  test('shows system settings recovery only for a configured revoked scope', () => {
    mockPolicies = makePolicies({ 'permissions.health_read': 'always' });
    mockStatuses = { 'permissions.health_read': 'denied' };
    renderScreen();

    expect(texts()).toContain('settings.permissions.openSystemSettings');
  });

  test('requests a restored policy that has not been authorized on this device', async () => {
    mockPolicies = makePolicies({ 'permissions.health_read': 'always' });
    mockStatuses = { 'permissions.health_read': 'undetermined' };
    renderScreen();

    await pressRecovery();

    expect(mockRequestPermission).toHaveBeenCalledWith('permissions.health_read');
    expect(mockOpenSettings).not.toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalled();
  });

  test('opens system settings after access was denied or revoked', async () => {
    mockPolicies = makePolicies({ 'permissions.health_read': 'always' });
    mockStatuses = { 'permissions.health_read': 'denied' };
    renderScreen();

    await pressRecovery();

    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockOpenSettings).toHaveBeenCalledWith('health');
  });

  function renderScreen() {
    act(() => {
      renderer = create(<PermissionDetailSettingsScreen />);
    });
  }

  function radios() {
    if (!renderer) {
      throw new Error('Screen was not rendered');
    }
    const labels = new Set<string>();
    return renderer.root.findAll((node) => {
      const label = node.props.accessibilityLabel;
      if (
        node.props.accessibilityRole !== 'radio' ||
        typeof label !== 'string' ||
        labels.has(label)
      ) {
        return false;
      }
      labels.add(label);
      return true;
    });
  }

  async function pressRadio(label: string) {
    const radio = radios().find((node) => node.props.accessibilityLabel === label);
    if (!radio) {
      throw new Error(`No radio found for ${label}`);
    }
    await act(async () => radio.props.onPress());
  }

  async function pressRecovery() {
    if (!renderer) {
      throw new Error('Screen was not rendered');
    }
    const button = renderer.root
      .findAll(
        (node) => node.props.accessibilityLabel === 'settings.permissions.openSystemSettings',
      )
      .at(0);
    if (!button) {
      throw new Error('Recovery action was not rendered');
    }
    await act(async () => button.props.onPress());
  }

  function texts() {
    if (!renderer) {
      throw new Error('Screen was not rendered');
    }
    return renderer.root
      .findAllByType(Text)
      .map((node) => node.props.children)
      .filter((value): value is string => typeof value === 'string');
  }

  function modeLabels() {
    return texts().filter((value) => value.startsWith('settings.permissions.mode.'));
  }
});

function makePolicies(overrides: Record<string, PermissionMode> = {}) {
  return {
    'permissions.calendar_read': 'never',
    'permissions.calendar_write': 'never',
    'permissions.health_read': 'never',
    'permissions.location_read': 'never',
    'permissions.reminders_read': 'never',
    'permissions.reminders_write': 'never',
    ...overrides,
  };
}
