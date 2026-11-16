import { type CloudState, hasActiveCloudSubscription } from '../cloud';

const now = Date.parse('2026-11-12T00:00:00Z');
const active: CloudState = {
  phase: 'ready',
  isRefreshing: false,
  account: {
    measured_at: '2026-11-12T00:00:00Z',
    account: { id: 'account-1', status: 'active' },
    device: { id: 'device-1' },
    entitlements: [
      {
        plan_id: 'paid',
        is_free: false,
        status: 'active',
        model_ids: ['chat'],
        starts_at: '2026-11-01T00:00:00Z',
        expires_at: '2026-12-01T00:00:00Z',
      },
    ],
    quota_pools: [],
  },
  plans: null,
  models: [],
  webUrl: null,
};

describe('active cloud subscriptions', () => {
  test('recognizes a paid subscription even when quota and model projection are not available', () => {
    expect(hasActiveCloudSubscription(active, now)).toBe(true);
  });

  test.each([
    { is_free: true },
    { status: 'inactive' as const },
    { status: 'expired' as const },
    { starts_at: '2026-12-01T00:00:00Z' },
    { expires_at: '2026-11-12T00:00:00Z' },
  ])('rejects an entitlement that is not a current paid subscription: %p', (change) => {
    const account = active.account!;
    expect(
      hasActiveCloudSubscription(
        {
          ...active,
          account: { ...account, entitlements: [{ ...account.entitlements[0]!, ...change }] },
        },
        now,
      ),
    ).toBe(false);
  });

  test.each(['loading', 'error', 'signed_out'] as const)(
    'does not trust an old snapshot while %s',
    (phase) => {
      expect(hasActiveCloudSubscription({ ...active, phase }, now)).toBe(false);
    },
  );

  test('rejects a disabled cloud account', () => {
    expect(
      hasActiveCloudSubscription(
        {
          ...active,
          account: { ...active.account!, account: { id: 'account-1', status: 'disabled' } },
        },
        now,
      ),
    ).toBe(false);
  });
});
