import type { PermissionMode } from '@cherrystudio/universal/data/preference';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BackendProvider } from '@/frontend/data';
import type { Backend } from '@/shared/contracts';

import PermissionDetailSettingsScreen from '../PermissionDetailScreen';

const mockSetMode = jest.fn(async (_mode: PermissionMode) => undefined);
const mockSetPolicy = jest.fn(async (_key: string, policy: PermissionMode) => ({
  policy,
  status: 'granted' as const,
}));
const mockRecover = jest.fn(async () => ({}));
const mockRefresh = jest.fn(async () => undefined);
let mockPermission = 'health';
let mockMode: PermissionMode = 'never';
let mockPolicies = makePolicies();
let mockStatuses: Record<string, string> = {};
const backend = {
  permissions: {
    recover: mockRecover,
    setPolicy: mockSetPolicy,
  },
} as unknown as Backend;

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
jest.mock('@/frontend/components/headers', () => ({ BackHeader: () => null }));
jest.mock('@/frontend/data/hooks', () => ({
  usePreference: () => [mockMode, mockSetMode],
}));
jest.mock('../hooks/usePermissionPolicies', () => ({
  usePermissionPolicies: () => mockPolicies,
}));
jest.mock('../hooks/usePermissionSystemStatuses', () => ({
  usePermissionSystemStatuses: () => ({ refresh: mockRefresh, statuses: mockStatuses }),
}));
jest.mock('@/frontend/components/Section', () => ({
  Section: ({
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

  test('delegates policy changes to the permissions backend', async () => {
    renderScreen();

    await pressRadio('settings.permissions.mode.ask');

    expect(mockSetPolicy).toHaveBeenCalledWith('permissions.health_read', 'ask');
    expect(mockSetMode).not.toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalled();
  });

  test('switches ask to always through the same backend interface', async () => {
    mockMode = 'ask';
    renderScreen();

    await pressRadio('settings.permissions.mode.always');

    expect(mockSetPolicy).toHaveBeenCalledWith('permissions.health_read', 'always');
  });

  test('shows system settings recovery only for a configured revoked scope', () => {
    mockPolicies = makePolicies({ 'permissions.health_read': 'always' });
    mockStatuses = { 'permissions.health_read': 'denied' };
    renderScreen();

    expect(texts()).toContain('settings.permissions.openSystemSettings');
  });

  test('delegates recovery for a configured scope and refreshes its status', async () => {
    mockPolicies = makePolicies({ 'permissions.health_read': 'always' });
    mockStatuses = { 'permissions.health_read': 'undetermined' };
    renderScreen();

    await pressRecovery();

    expect(mockRecover).toHaveBeenCalledWith(['permissions.health_read']);
    expect(mockRefresh).toHaveBeenCalled();
  });

  function renderScreen() {
    act(() => {
      renderer = create(
        <BackendProvider backend={backend}>
          <PermissionDetailSettingsScreen />
        </BackendProvider>,
      );
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
