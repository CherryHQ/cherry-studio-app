import {
  ENDPOINT_TYPE,
  endpointImpliedCapability,
  MODALITY,
  MODEL_CAPABILITY,
} from '@cherrystudio/provider-registry';

import type { Model } from '@/shared/data/types/model';

export function isTextGenerationModel(model: Model): boolean {
  return !isNonTextGenerationModel(model);
}

export function isImageGenerationModel(model: Model): boolean {
  return model.capabilities.includes(MODEL_CAPABILITY.IMAGE_GENERATION);
}

export function isEmbeddingModel(model: Model): boolean {
  return model.capabilities.includes(MODEL_CAPABILITY.EMBEDDING);
}

export function isRerankModel(model: Model): boolean {
  return model.capabilities.includes(MODEL_CAPABILITY.RERANK);
}

export function isAudioGenerationModel(model: Model): boolean {
  return model.capabilities.includes(MODEL_CAPABILITY.AUDIO_GENERATION);
}

export function isVideoGenerationModel(model: Model): boolean {
  return model.capabilities.includes(MODEL_CAPABILITY.VIDEO_GENERATION);
}

export function hasTextToSpeechEndpoint(model: Model): boolean {
  return model.endpointTypes?.includes(ENDPOINT_TYPE.OPENAI_TEXT_TO_SPEECH) ?? false;
}

export function isSpeechToTextModel(model: Model): boolean {
  return (
    model.capabilities.includes(MODEL_CAPABILITY.AUDIO_TRANSCRIPT) ||
    (model.capabilities.includes(MODEL_CAPABILITY.AUDIO_RECOGNITION) &&
      model.inputModalities?.includes(MODALITY.AUDIO) === true &&
      !model.inputModalities.includes(MODALITY.TEXT) &&
      model.outputModalities?.includes(MODALITY.TEXT) === true)
  );
}

function isNonTextGenerationModel(model: Model): boolean {
  return (
    endpointImpliedCapability(model.endpointTypes?.[0]) != null ||
    isEmbeddingModel(model) ||
    isRerankModel(model) ||
    isImageGenerationModel(model) ||
    isVideoGenerationModel(model) ||
    isAudioGenerationModel(model) ||
    isSpeechToTextModel(model)
  );
}
