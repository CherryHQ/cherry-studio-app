import type { PermissionMode } from '@cherrystudio/universal/data/preference';
import type { ReactNode } from 'react';
import { Platform, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import PermissionsSettingsScreen from '../PermissionsScreen';

const mockPush = jest.fn();
let mockPolicies = makePolicies();
let mockStatuses: Record<string, string> = {};

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('lucide-uniwind/png', () => ({
  BellRingIcon: () => null,
  CalendarIcon: () => null,
  ChevronRightIcon: () => null,
  HeartPulseIcon: () => null,
  MapPinIcon: () => null,
}));
jest.mock('@/frontend/components/headers', () => ({ BackHeader: () => null }));
jest.mock('../hooks/usePermissionPolicies', () => ({
  usePermissionPolicies: () => mockPolicies,
}));
jest.mock('../hooks/usePermissionSystemStatuses', () => ({
  usePermissionSystemStatuses: () => ({ statuses: mockStatuses }),
}));
jest.mock('../../components/SettingsSection', () => ({
  SettingsSection: ({
    items,
  }: {
    items: { accessory?: ReactNode; id: string; imageSource?: unknown; title: string }[];
  }) => {
    const { Fragment } = jest.requireActual('react');
    const { Text: MockText } = jest.requireActual('react-native');
    return (
      <Fragment>
        {items.map((item) => (
          <Fragment key={item.id}>
            <MockText>{item.title}</MockText>
            <MockText>{item.accessory ? 'custom-accessory' : 'default-accessory'}</MockText>
            <MockText>{item.imageSource ? 'image-source' : 'component-icon'}</MockText>
            {item.accessory}
          </Fragment>
        ))}
      </Fragment>
    );
  },
}));

describe('PermissionsSettingsScreen', () => {
  let renderer: ReactTestRenderer | undefined;
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPolicies = makePolicies();
    mockStatuses = {};
    setPlatform(originalPlatform);
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  afterAll(() => setPlatform(originalPlatform));

  test('shows Reminders on iOS', () => {
    setPlatform('ios');
    renderScreen();

    expect(texts()).toContain('settings.permissions.type.reminders');
    expect(texts().filter((text) => text === 'image-source')).toHaveLength(4);
  });

  test('hides Reminders on Android', () => {
    setPlatform('android');
    renderScreen();

    expect(texts()).not.toContain('settings.permissions.type.reminders');
    expect(texts()).toContain('settings.permissions.type.health');
    expect(texts().filter((text) => text === 'component-icon')).toHaveLength(3);
  });

  test('shows a status and navigation chevron for every permission', () => {
    setPlatform('ios');
    renderScreen();

    expect(texts().filter((text) => text === 'settings.permissions.summary.never')).toHaveLength(4);
    expect(texts().filter((text) => text === 'custom-accessory')).toHaveLength(4);
  });

  test('shows access required for a configured scope whose system permission was revoked', () => {
    mockPolicies = makePolicies({ 'permissions.health_read': 'always' });
    mockStatuses = { 'permissions.health_read': 'denied' };
    renderScreen();

    expect(texts()).toContain('settings.permissions.accessRequired');
  });

  function renderScreen() {
    act(() => {
      renderer = create(<PermissionsSettingsScreen />);
    });
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
});

function setPlatform(platform: string) {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
}

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
