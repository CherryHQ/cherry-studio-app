import type { CloudPlans } from '@/shared/contracts/cloud';

import { getSubscriptionOverview } from '../subscriptionOverview';

const freePlan = { id: 'free', display_name: 'Free', is_free: true };
const paidPlan = { id: 'paid', display_name: 'Paid', is_free: false };
const availablePlan = { id: 'available', display_name: 'Available paid plan', is_free: false };

function entitlement(
  id: string,
  state: CloudPlans['entitlements'][number]['state'],
  plan = paidPlan,
): CloudPlans['entitlements'][number] {
  return { id, state, plan, starts_at: '2026-11-01T00:00:00Z', quota_pools: [] };
}

it('shows the current paid subscription instead of free, historical or future entitlements', () => {
  const current = entitlement('current', 'active');
  const overview = getSubscriptionOverview({
    measured_at: '2026-11-04T00:00:00Z',
    available_plans: [availablePlan],
    entitlements: [
      entitlement('free', 'active', freePlan),
      entitlement('expired', 'expired'),
      entitlement('upcoming', 'upcoming'),
      entitlement('disabled', 'disabled'),
      current,
    ],
  });
  expect(overview.subscription).toBe(current);
  expect(overview.plan).toBe(current.plan);
});

it('offers an available paid plan without showing an expired subscription or its quota', () => {
  const overview = getSubscriptionOverview({
    measured_at: '2026-11-04T00:00:00Z',
    available_plans: [freePlan, availablePlan],
    entitlements: [entitlement('free', 'active', freePlan), entitlement('expired', 'expired')],
  });
  expect(overview.subscription).toBeUndefined();
  expect(overview.plan).toBe(availablePlan);
});

it('does not fabricate a paid plan when subscription data or a paid offer is absent', () => {
  expect(getSubscriptionOverview(null)).toEqual({ subscription: undefined, plan: undefined });
  expect(
    getSubscriptionOverview({
      measured_at: '2026-11-04T00:00:00Z',
      available_plans: [freePlan],
      entitlements: [entitlement('free', 'active', freePlan)],
    }),
  ).toEqual({ subscription: undefined, plan: undefined });
});
