import type { Model } from '@/shared/data/types/model';
import { isImageGenerationModel, isTextGenerationModel } from '@/shared/utils/modelPurpose';

/** Product-selectable model families currently shipped on mobile. */
export const MODEL_TYPE_FILTERS = ['all', 'text', 'image'] as const;

export type ModelTypeFilter = (typeof MODEL_TYPE_FILTERS)[number];

export function matchesModelTypeFilter(model: Model, filter: ModelTypeFilter): boolean {
  switch (filter) {
    case 'text':
      return isTextGenerationModel(model);
    case 'image':
      return isImageGenerationModel(model);
    default:
      return true;
  }
}

export function filterModelsByType(models: readonly Model[], filter: ModelTypeFilter): Model[] {
  return filter === 'all'
    ? [...models]
    : models.filter((model) => matchesModelTypeFilter(model, filter));
}
