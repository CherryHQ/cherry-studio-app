import { ENDPOINT_TYPE, MODALITY, type ImageGenerationMode } from '@cherrystudio/provider-registry';

import type { Model } from '@/shared/data/types/model';

import { isImageGenerationModel } from './modelPurpose';

/**
 * Whether a model can serve the generic painting composer for the requested
 * text-to-image or image-edit interaction. Registry metadata is authoritative;
 * image endpoint declarations are the fallback for gateway models, followed by
 * legacy capability/modalities metadata.
 */
export function supportsPaintingGenerationMode(
  model: Model | undefined,
  mode: Extract<ImageGenerationMode, 'edit' | 'generate'>,
): boolean {
  if (!model) {
    return false;
  }

  if (model.imageGeneration) {
    return Boolean(model.imageGeneration.modes[mode]);
  }

  const imageEndpointTypes =
    model.endpointTypes?.filter(
      (endpointType) =>
        endpointType === ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION ||
        endpointType === ENDPOINT_TYPE.OPENAI_IMAGE_EDIT,
    ) ?? [];
  if (imageEndpointTypes.length > 0) {
    const requiredEndpoint =
      mode === 'edit' ? ENDPOINT_TYPE.OPENAI_IMAGE_EDIT : ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION;
    return imageEndpointTypes.includes(requiredEndpoint);
  }

  return (
    isImageGenerationModel(model) &&
    (mode === 'generate' || model.inputModalities?.includes(MODALITY.IMAGE) === true)
  );
}
