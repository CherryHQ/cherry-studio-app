import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';

import type { Model } from '@/shared/data/types/model';

export const PROVIDER_MODEL_BADGES = ['free', 'vision'] as const;

export type ProviderModelBadge = (typeof PROVIDER_MODEL_BADGES)[number];

const FREE_MARKER_PATTERN = /(?:^|[^a-z0-9])free(?:$|[^a-z0-9])/i;

/** The small set of model traits that materially helps someone choose from a provider list. */
export function getProviderModelBadges(model: Model): ProviderModelBadge[] {
  const badges: ProviderModelBadge[] = [];

  if (isFreeProviderModel(model)) {
    badges.push('free');
  }
  if (isVisionProviderModel(model)) {
    badges.push('vision');
  }

  return badges;
}

function isFreeProviderModel(model: Model): boolean {
  if (model.providerId.toLocaleLowerCase() === 'cherryai') {
    return true;
  }

  return [model.modelId, model.apiModelId, model.name, model.presetModelId].some(
    (value) => value != null && FREE_MARKER_PATTERN.test(value),
  );
}

function isVisionProviderModel(model: Model): boolean {
  return model.capabilities.includes(MODEL_CAPABILITY.IMAGE_RECOGNITION);
}
