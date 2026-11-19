import {
  cloudModelUnavailable,
  isCloudAmdModel,
  isCloudFreeModel,
  isEffectiveEntitlement,
  supportsCloudModelUse,
  type CloudModelUse,
  type CloudModel,
  type CloudState,
  type CloudUnavailableReason,
} from '@/shared/contracts/cloud';

export type CloudModelOffer = {
  model: CloudModel;
  isFree: boolean;
  isAmd: boolean;
  reason: CloudUnavailableReason | 'subscription_required' | undefined;
  plans: string[];
};

/** The directory owns visibility. Account plans only explain why a listed model is locked. */
export function getCloudModelOffers(state: CloudState, use?: CloudModelUse) {
  const offers = new Map<string, CloudModelOffer>();
  const effective =
    state.account?.entitlements.filter((entry) => isEffectiveEntitlement(entry, Date.now())) ?? [];
  for (const model of state.models) {
    const purpose = use ?? (supportsCloudModelUse(model, 'agent') ? 'agent' : 'general');
    let reason: CloudModelOffer['reason'] = cloudModelUnavailable(state, model.id, purpose);
    const plans =
      state.plans?.available_plans.filter((plan) =>
        plan.models?.some((item) => item.id === model.id),
      ) ?? [];
    if (
      reason === 'not_entitled' &&
      state.phase === 'ready' &&
      state.account?.account.status === 'active' &&
      supportsCloudModelUse(model, purpose) &&
      !isCloudAmdModel(model) &&
      plans.length &&
      plans.every(
        (plan) =>
          !plan.is_free &&
          !effective.some(
            (entry) => entry.plan_id === plan.id || entry.model_ids.includes(model.id),
          ),
      )
    ) {
      reason = 'subscription_required';
    }
    offers.set(model.id, {
      model,
      isFree: isCloudFreeModel(state, model) || plans.some((plan) => plan.is_free),
      isAmd: isCloudAmdModel(model),
      reason,
      plans: plans.map((plan) => plan.display_name),
    });
  }
  return offers;
}
