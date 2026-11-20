import { CLOUD_PROVIDER_ID, type CloudModel } from '@/shared/contracts/cloud';
import { createUniqueModelId } from '@/shared/data/types/model';

/** Display identity for a catalog model, including one that cannot be selected yet. */
export function toCloudModelPreview(model: CloudModel) {
  return {
    capabilities: model.capabilities,
    id: createUniqueModelId(CLOUD_PROVIDER_ID, model.id),
    modelId: model.id,
    name: model.display_name,
    providerId: CLOUD_PROVIDER_ID,
  };
}
