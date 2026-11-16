import {
  CLOUD_PROVIDER_ID,
  cloudModelUnavailable,
  hasActiveCloudSubscription,
  type CloudState,
} from '@/shared/contracts/cloud';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';
import { isTextGenerationModel } from '@/shared/utils/modelPurpose';

export function getOnboardingModels({
  local,
  remote,
  providers,
  providerId,
}: {
  local: readonly Model[];
  remote: readonly Model[];
  providers: readonly Provider[];
  providerId?: string;
}): Model[] {
  const availableProviders = new Set(
    providers
      .filter((provider) => provider.id === providerId || provider.isEnabled)
      .map((provider) => provider.id),
  );
  const byId = new Map([...remote, ...local].map((model) => [model.id, model]));
  return [...byId.values()]
    .filter(
      (model) =>
        availableProviders.has(model.providerId) &&
        (!providerId || model.providerId === providerId) &&
        isTextGenerationModel(model),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}
/** Saved rows provide model identities; the current account owns their entitlement. */
export function getOnboardingSubscriptionModels(
  cloud: CloudState,
  models: readonly Model[],
): Model[] {
  if (cloud.isRefreshing || !hasActiveCloudSubscription(cloud)) return [];
  return models
    .filter((model) => {
      if (
        model.providerId !== CLOUD_PROVIDER_ID ||
        !model.isEnabled ||
        model.isHidden ||
        !isTextGenerationModel(model)
      )
        return false;
      const reason = cloudModelUnavailable(cloud, model.modelId, 'agent');
      // An exhausted quota does not revoke the model or the user's default selection.
      return reason === undefined || reason === 'quota_exhausted';
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
