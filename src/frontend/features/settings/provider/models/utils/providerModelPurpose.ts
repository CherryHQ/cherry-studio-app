import type { Model } from '@/shared/data/types/model';
import { isImageGenerationModel, isTextGenerationModel } from '@/shared/utils/modelPurpose';

export const PROVIDER_MODEL_PURPOSES = ['all', 'chat', 'painting'] as const;

export type ProviderModelPurpose = (typeof PROVIDER_MODEL_PURPOSES)[number];

export type ProviderModelPurposeCounts = Record<ProviderModelPurpose, number>;

export function matchesProviderModelPurpose(model: Model, purpose: ProviderModelPurpose): boolean {
  switch (purpose) {
    case 'chat':
      return isTextGenerationModel(model);
    case 'painting':
      return isImageGenerationModel(model);
    default:
      return true;
  }
}

export function filterProviderModelsByPurpose(
  models: readonly Model[],
  purpose: ProviderModelPurpose,
): Model[] {
  return purpose === 'all'
    ? [...models]
    : models.filter((model) => matchesProviderModelPurpose(model, purpose));
}

export function getProviderModelPurposeCounts(
  models: readonly Model[],
): ProviderModelPurposeCounts {
  const counts: ProviderModelPurposeCounts = {
    all: models.length,
    chat: 0,
    painting: 0,
  };

  for (const model of models) {
    if (isTextGenerationModel(model)) {
      counts.chat += 1;
    } else if (isImageGenerationModel(model)) {
      counts.painting += 1;
    }
  }

  return counts;
}

export function getEffectiveProviderModelPurpose(
  purpose: ProviderModelPurpose,
  counts: ProviderModelPurposeCounts,
): ProviderModelPurpose {
  return purpose !== 'all' && counts[purpose] === 0 ? 'all' : purpose;
}

export function hasMultipleProviderModelPurposes(counts: ProviderModelPurposeCounts): boolean {
  return counts.chat > 0 && counts.painting > 0;
}
