import {
  CloudAccountSchema,
  CloudPlansSchema,
  cloudModelUnavailable,
} from '@/shared/contracts/cloud';

import { cloudSnapshot } from './cloudFixtures';

const now = Date.parse('2026-10-31T00:00:00Z');

test('all windows in a pool constrain credit, while another pool can independently admit a model', () => {
  const state = cloudSnapshot();
  const pool = state.account!.quota_pools[0];
  pool.windows.push({ ...pool.windows[0], window_type: 'calendar_day', remaining_units: 0 });
  expect(cloudModelUnavailable(state, 'cloud-model', 'agent', now)).toBe('quota_exhausted');
  state.account!.quota_pools.push({
    ...pool,
    allocation_id: 'other-pool',
    windows: [{ ...pool.windows[0] }],
  });
  expect(cloudModelUnavailable(state, 'cloud-model', 'agent', now)).toBeUndefined();
});

test('general generation requires both chat and translate, independently of Agent use', () => {
  const state = cloudSnapshot();
  state.models[0].available_features = ['agent', 'chat'];
  expect(cloudModelUnavailable(state, 'cloud-model', 'agent', now)).toBeUndefined();
  expect(cloudModelUnavailable(state, 'cloud-model', 'general', now)).toBe('not_entitled');
});

test('expired and not-yet-active entitlements cannot grant a model', () => {
  const state = cloudSnapshot();
  state.account!.entitlements[0].expires_at = '2026-10-30T00:00:00Z';
  expect(cloudModelUnavailable(state, 'cloud-model', 'agent', now)).toBe('not_entitled');
  state.account!.entitlements[0].expires_at = '2099-01-01T00:00:00Z';
  state.account!.entitlements[0].starts_at = '2026-11-01T00:00:00Z';
  expect(cloudModelUnavailable(state, 'cloud-model', 'agent', now)).toBe('not_entitled');
});

test('stale or signed-out state never grants access even if it carries previous data', () => {
  const state = cloudSnapshot();
  expect(cloudModelUnavailable({ ...state, phase: 'error' }, 'cloud-model', 'agent', now)).toBe(
    'unavailable',
  );
  expect(
    cloudModelUnavailable({ ...state, phase: 'signed_out' }, 'cloud-model', 'agent', now),
  ).toBe('signed_out');
});

test('a subscription-month boundary and an empty quota pool both fail closed', () => {
  const state = cloudSnapshot();
  state.account!.quota_pools[0].windows[0].period_end = '2026-10-31T00:00:00Z';
  expect(cloudModelUnavailable(state, 'cloud-model', 'agent', now)).toBe('quota_exhausted');
  state.account!.quota_pools[0].windows = [];
  expect(cloudModelUnavailable(state, 'cloud-model', 'agent', now)).toBe('quota_exhausted');
});

test('the wire contract retains reserved money units and subscription-month dates', () => {
  const state = cloudSnapshot();
  expect(CloudAccountSchema.parse(state.account).quota_pools[0].windows[0]).toMatchObject({
    remaining_units: 7_000_000,
    active_reserved_units: 1_000_000,
    window_type: 'subscription_month',
    period_end: '2099-01-01T00:00:00Z',
  });
  expect(CloudPlansSchema.parse(state.plans).entitlements).toEqual([]);
  delete state.account!.quota_pools[0].currency;
  expect(CloudAccountSchema.safeParse(state.account).success).toBe(false);
});
