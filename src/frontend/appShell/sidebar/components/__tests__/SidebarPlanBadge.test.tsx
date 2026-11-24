import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { CloudState } from '@/shared/contracts/cloud';

import { SidebarPlanBadge } from '../SidebarPlanBadge';

const mockCloud = { refresh: jest.fn().mockResolvedValue(undefined) };
const mockCloudState: CloudState = {
  phase: 'ready',
  isRefreshing: false,
  account: {
    measured_at: '2026-01-01T00:00:00Z',
    account: { id: 'account', status: 'active' },
    device: { id: 'device' },
    entitlements: [{ plan_id: 'plan', is_free: false, status: 'active', model_ids: [] }],
    quota_pools: [],
  },
  plans: null,
  models: [],
};
let mockSidebarPresence: 'open' | 'closed' = 'closed';

jest.mock('@cherrystudio/ui/components', () => ({ TextAnimation: {} }));
jest.mock('@cherrystudio/ui/utils', () => ({ cn: (...values: string[]) => values.join(' ') }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
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
jest.mock('../../SidebarSelectionProvider', () => ({ useSidebarSelectionSnapshot: () => false }));

test('opening the drawer shows the cached subscription without refreshing Cloud', () => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<SidebarPlanBadge />);
  });

  mockSidebarPresence = 'open';
  act(() => renderer.update(<SidebarPlanBadge />));

  expect(renderer.root.findAllByProps({ testID: 'sidebar-plan-badge' }).length).toBeGreaterThan(0);
  expect(mockCloud.refresh).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});
