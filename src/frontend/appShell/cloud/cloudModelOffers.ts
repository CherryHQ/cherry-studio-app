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
};

/** The directory owns visibility. Current account entitlements determine access. */
export function getCloudModelOffers(state: CloudState, use?: CloudModelUse) {
  const offers = new Map<string, CloudModelOffer>();
  for (const model of state.models) {
    const purpose = use ?? (supportsCloudModelUse(model, 'agent') ? 'agent' : 'general');
    const reason = cloudModelUnavailable(state, model.id, purpose);
    const isAmd = isCloudAmdModel(model);
    offers.set(model.id, {
      model,
      isAmd,
      canViewUsage:
        !reason &&
        isAmd &&
        Boolean(model.activation_endpoint) &&
        state.amd?.phase !== 'unsupported',
      reason,
    });
  }
  return offers;
}

/** Notices for taps that did not already open login or activation. */
export function getCloudModelTapNotice(offer: CloudModelOffer | undefined) {
  switch (offer ? offer.reason : 'unavailable') {
    case 'signed_out':
    case 'unavailable':
      return 'chat.errorPart.reason.providerUnavailable';
    case 'account_disabled':
      return 'cloud.accountDisabled';
    case 'not_entitled':
      return 'cloud.notEntitled';
    default:
      return undefined;
  }
}
