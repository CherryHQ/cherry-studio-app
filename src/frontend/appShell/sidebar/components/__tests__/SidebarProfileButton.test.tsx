import { TextAnimation } from '@cherrystudio/ui/components';
import { AppState } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { CloudAccount, CloudState } from '@/shared/contracts/cloud';

import { SidebarAvatarRing } from '../SidebarAvatarRing';
import { SidebarProfileButton } from '../SidebarProfileButton';

const props = { disabled: false, selected: false, onPress: jest.fn() };
const dailyWindow = {
  window_type: 'calendar_day',
  duration_seconds: 86_400,
  limit_units: 100,
  used_units: 32,
  active_reserved_units: 0,
  remaining_units: 68,
} as const;
const pool: CloudAccount['quota_pools'][number] = {
  allocation_id: 'pool',
  display_name: 'Messages',
  measurement_kind: 'requests',
  model_ids: [],
  windows: [
    dailyWindow,
    {
      ...dailyWindow,
      window_type: 'subscription_month',
      duration_seconds: 30 * 86_400,
      used_units: 100,
      remaining_units: 0,
    },
  ],
};

const mockCloud = { refresh: jest.fn().mockResolvedValue(undefined) };
const subscribedState: CloudState = {
  phase: 'ready',
  isRefreshing: false,
  account: {
    measured_at: '2026-01-01T00:00:00Z',
    account: { id: 'account', status: 'active' },
    device: { id: 'device' },
    entitlements: [{ plan_id: 'plan', is_free: false, status: 'active', model_ids: [] }],
    quota_pools: [pool],
  },
  plans: {
    measured_at: '2026-01-01T00:00:00Z',
    available_plans: [],
    entitlements: [
      {
        id: 'subscription',
        state: 'active',
        starts_at: '2026-01-01T00:00:00Z',
        plan: { id: 'plan', display_name: 'Cherry Pro', is_free: false },
        quota_pools: [pool],
      },
    ],
  },
  models: [],
};
let mockCloudState: CloudState;
let mockSidebarPresence: 'open' | 'closed';

jest.mock('@cherrystudio/ui/components', () => ({ TextAnimation: { Rotating: () => null } }));
jest.mock('@cherrystudio/app-icons/icons/settings', () => () => null);
jest.mock('@/frontend/components/Avatar', () => ({ ProfileAvatarImage: () => null }));
jest.mock('@/frontend/data/hooks', () => ({ usePreference: () => ['Lin'] }));
jest.mock('../SidebarAvatarRing', () => ({ SidebarAvatarRing: () => null }));
jest.mock('@cherrystudio/ui/utils', () => ({ cn: (...values: string[]) => values.join(' ') }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string, values?: { percent?: string; window?: string }) =>
      values?.percent ? [values.window, values.percent].filter(Boolean).join(' ') : key,
  }),
}));
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => false }));
jest.mock('@/frontend/appShell/account', () => ({
  useAccount: () => ({ state: { isEnterprise: false } }),
}));
jest.mock('@/frontend/hooks/useCloud', () => ({
  useCloud: () => ({ cloud: mockCloud, state: mockCloudState }),
}));
jest.mock('../../hooks/useSidebarPresence', () => ({
  useSidebarPresence: () => mockSidebarPresence,
}));

test('opening the drawer shows the cached subscription without refreshing Cloud', () => {
  mockCloudState = { ...subscribedState, plans: null };
  mockSidebarPresence = 'closed';
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<SidebarProfileButton {...props} />);
  });

  mockSidebarPresence = 'open';
  act(() => renderer.update(<SidebarProfileButton {...props} />));

  expect(renderer.root.findAllByProps({ testID: 'sidebar-plan-badge' }).length).toBeGreaterThan(0);
  expect(mockCloud.refresh).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

test('the ring and caption cycle through the same quota windows, including an empty one', () => {
  mockCloudState = subscribedState;
  jest.useFakeTimers();
  const previousAppState = AppState.currentState;
  AppState.currentState = 'active';
  mockSidebarPresence = 'open';
  let renderer!: ReactTestRenderer;
  try {
    act(() => {
      renderer = create(<SidebarProfileButton {...props} />);
    });
    const frame = () => [
      renderer.root.findByType(SidebarAvatarRing).props.ratio,
      renderer.root.findByType(TextAnimation.Rotating).props.text,
    ];
    expect(frame()).toEqual([undefined, 'Cherry Pro']);
    act(() => jest.advanceTimersByTime(4000));
    expect(frame()).toEqual([0.68, 'cloud.quotaDayShort 68%']);
    act(() => jest.advanceTimersByTime(3000));
    expect(frame()).toEqual([0, 'cloud.quotaMonthShort 0%']);

    mockSidebarPresence = 'closed';
    act(() => renderer.update(<SidebarProfileButton {...props} />));
    mockSidebarPresence = 'open';
    act(() => renderer.update(<SidebarProfileButton {...props} />));
    expect(frame()).toEqual([undefined, 'Cherry Pro']);
  } finally {
    act(() => renderer?.unmount());
    AppState.currentState = previousAppState;
    jest.useRealTimers();
  }
});
