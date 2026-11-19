import {
  cloudModelUnavailable,
  isCloudAmdModel,
  supportsCloudModelUse,
  type CloudModelUse,
  type CloudModel,
  type CloudState,
  type CloudUnavailableReason,
} from '@/shared/contracts/cloud';

export type CloudModelOffer = {
  model: CloudModel;
  isAmd: boolean;
  canViewUsage: boolean;
  reason: CloudUnavailableReason | undefined;
  plans: string[];
};

/** The directory owns visibility. Account plans only explain why a listed model is locked. */
export function getCloudModelOffers(state: CloudState, use?: CloudModelUse) {
  const offers = new Map<string, CloudModelOffer>();
  for (const model of state.models) {
    const purpose = use ?? (supportsCloudModelUse(model, 'agent') ? 'agent' : 'general');
    const reason = cloudModelUnavailable(state, model.id, purpose);
    const isAmd = isCloudAmdModel(model);
    const plans =
      reason === 'subscription_required'
        ? state.plans?.available_plans.filter((plan) =>
            plan.models?.some((item) => item.id === model.id),
          )
        : undefined;
    offers.set(model.id, {
      model,
      isAmd,
      canViewUsage:
        !reason &&
        isAmd &&
        Boolean(model.activation_endpoint) &&
        state.amd?.phase !== 'unsupported',
      reason,
      plans: plans?.map((plan) => plan.display_name) ?? [],
    });
  }
  return offers;
}
