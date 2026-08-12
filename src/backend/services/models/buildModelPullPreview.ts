import type { Model } from '@cherrystudio/universal/data/types/model';

import type { ModelPullPreview } from '@/shared/contracts';

export function buildModelPullPreview(
  providerId: string,
  localModels: readonly Model[],
  catalogModels: readonly Model[],
): ModelPullPreview {
  const localIds = new Set(localModels.map((model) => model.id));
  const catalogIds = new Set(catalogModels.map((model) => model.id));

  return {
    added: catalogModels.filter((model) => !localIds.has(model.id)),
    missing: localModels.filter(
      (model) =>
        model.providerId === providerId &&
        !catalogIds.has(model.id) &&
        model.presetModelId != null &&
        model.presetModelId !== '',
    ),
  };
}
