import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';

import type { Model } from '@/shared/data/types/model';

/** The compact model traits that are useful while choosing a chat model. */
export const MODEL_PICKER_BADGES = ['free', 'vision'] as const;

export type ModelPickerBadge = (typeof MODEL_PICKER_BADGES)[number];

const FREE_MARKER_PATTERN = /(?:^|[^a-z0-9])free(?:$|[^a-z0-9])/i;

export function getModelPickerBadges(model: Model): ModelPickerBadge[] {
  const badges: ModelPickerBadge[] = [];

  if (isFreeModel(model)) {
    badges.push('free');
  }
  if (model.capabilities.includes(MODEL_CAPABILITY.IMAGE_RECOGNITION)) {
    badges.push('vision');
  }

  return badges;
}

/** All selected badges must be present; this makes Free + Vision useful together. */
export function matchesModelPickerBadges(
  model: Model,
  badges: readonly ModelPickerBadge[],
): boolean {
  return badges.every((badge) => getModelPickerBadges(model).includes(badge));
}

function isFreeModel(model: Model): boolean {
  if (model.providerId.toLocaleLowerCase() === 'cherryai') {
    return true;
  }

  return [model.modelId, model.apiModelId, model.name, model.presetModelId].some(
    (value) => value != null && FREE_MARKER_PATTERN.test(value),
  );
}
