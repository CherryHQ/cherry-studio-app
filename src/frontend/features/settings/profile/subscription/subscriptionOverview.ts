import type { CloudPlans } from '@/shared/contracts/cloud';

export function getSubscriptionOverview(plans: CloudPlans | null) {
  const subscription = plans?.entitlements.find(
    (entry) => entry.state === 'active' && !entry.plan.is_free,
  );
  return {
    subscription,
    plan: subscription?.plan ?? plans?.available_plans.find((entry) => !entry.is_free),
  };
}
