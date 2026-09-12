import { ENDPOINT_TYPE, MODALITY, type ImageGenerationMode } from '@cherrystudio/provider-registry';

import type { Model } from '@/shared/data/types/model';

import { isImageGenerationModel } from './modelPurpose';

/** Resolve the API mode separately from whether the user supplied reference images. */
export function resolvePaintingGenerationMode(
  model: Model | undefined,
  hasInputImages: boolean,
): Extract<ImageGenerationMode, 'edit' | 'generate'> | undefined {
  if (!model) return undefined;

  const modes = model.imageGeneration?.modes;
  if (modes) {
    if (!hasInputImages) return modes.generate ? 'generate' : undefined;
    if (modes.edit && modes.edit.maxInputImages !== 0) return 'edit';
    const generate = modes.generate;
    const acceptsReferenceImages =
      generate?.maxInputImages !== 0 &&
      (model.inputModalities?.includes(MODALITY.IMAGE) === true ||
        (generate?.maxInputImages ?? 0) > 0);
    return generate && acceptsReferenceImages ? 'generate' : undefined;
  }

  const mode = hasInputImages ? 'edit' : 'generate';
  const imageEndpointTypes =
    model.endpointTypes?.filter(
      (endpointType) =>
        endpointType === ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION ||
        endpointType === ENDPOINT_TYPE.OPENAI_IMAGE_EDIT,
    ) ?? [];
  if (imageEndpointTypes.length > 0) {
    const requiredEndpoint = hasInputImages
      ? ENDPOINT_TYPE.OPENAI_IMAGE_EDIT
      : ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION;
    return imageEndpointTypes.includes(requiredEndpoint) ? mode : undefined;
  }

  return isImageGenerationModel(model) &&
    (!hasInputImages || model.inputModalities?.includes(MODALITY.IMAGE) === true)
    ? mode
    : undefined;
}

/** `edit` here describes an image-input interaction, including generate with references. */
export function supportsPaintingGenerationMode(
  model: Model | undefined,
  mode: Extract<ImageGenerationMode, 'edit' | 'generate'>,
): boolean {
  return resolvePaintingGenerationMode(model, mode === 'edit') !== undefined;
}
