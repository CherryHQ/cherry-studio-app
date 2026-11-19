import { type CloudState, getActiveCloudEntitlements } from '../cloud';

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
};

describe('active cloud subscriptions', () => {
  test('recognizes a paid subscription even when quota and model projection are not available', () => {
    expect(getActiveCloudEntitlements(active, now)).toEqual(active.account!.entitlements);
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
      getActiveCloudEntitlements(
        {
          ...active,
          account: { ...account, entitlements: [{ ...account.entitlements[0]!, ...change }] },
        },
        now,
      ),
    ).toEqual([]);
  });

  test.each(['loading', 'signed_out'] as const)(
    'does not trust an old snapshot while %s',
    (phase) => {
      expect(getActiveCloudEntitlements({ ...active, phase }, now)).toEqual([]);
    },
  );

  test('a failed refresh keeps the last confirmed subscription visible until it expires', () => {
    const stale = { ...active, phase: 'error' } as const;
    expect(getActiveCloudEntitlements(stale, now)).toEqual(active.account!.entitlements);
    expect(getActiveCloudEntitlements(stale, Date.parse('2026-12-01T00:00:00Z'))).toEqual([]);
  });

  test('rejects a disabled cloud account', () => {
    expect(
      getActiveCloudEntitlements(
        {
          ...active,
          account: { ...active.account!, account: { id: 'account-1', status: 'disabled' } },
        },
        now,
      ),
    ).toEqual([]);
  });
});
