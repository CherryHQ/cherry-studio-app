import {
  ENDPOINT_TYPE,
  endpointImpliedCapability,
  MODALITY,
  MODEL_CAPABILITY,
} from '@cherrystudio/provider-registry';

import type { Model } from '@/shared/data/types/model';

/**
 * The pull screen filters by what a model is *for*, not by the overlapping
 * capability flags a row's tags show. Order mirrors desktop's tab row.
 */
export const MODEL_TYPE_FILTERS = [
  'all',
  'text',
  'image',
  'embedding',
  'audio',
  'video',
  'rerank',
  'speech',
  'transcription',
] as const;

export type ModelTypeFilter = (typeof MODEL_TYPE_FILTERS)[number];

export type ModelTypeCounts = Record<ModelTypeFilter, number>;

export const MODEL_TYPE_LABEL_KEYS = {
  all: 'models.all',
  audio: 'models.type.audio',
  embedding: 'models.type.embedding',
  image: 'models.type.image',
  rerank: 'models.type.rerank',
  speech: 'models.type.speech',
  text: 'models.type.text',
  transcription: 'models.type.transcription',
  video: 'models.type.video',
} as const satisfies Record<ModelTypeFilter, string>;

export function matchesModelTypeFilter(model: Model, filter: ModelTypeFilter): boolean {
  switch (filter) {
    case 'text':
      return !isNonChatModel(model);
    case 'image':
      return isGenerateImageModel(model);
    case 'embedding':
      return isEmbeddingModel(model);
    case 'audio':
      // "Generate audio", excluding text-to-speech, which has its own tab.
      return isGenerateAudioModel(model) && !hasTextToSpeechEndpoint(model);
    case 'video':
      return isGenerateVideoModel(model);
    case 'rerank':
      return isRerankModel(model);
    case 'speech':
      return hasTextToSpeechEndpoint(model);
    case 'transcription':
      return isSpeechToTextModel(model);
    default:
      return true;
  }
}

/**
 * `all` is the total rather than the sum of the rest: a model can answer to more
 * than one type filter, so the per-type counts overlap.
 */
export function getModelTypeCounts(models: readonly Model[]): ModelTypeCounts {
  const counts = Object.fromEntries(
    MODEL_TYPE_FILTERS.map((filter) => [filter, 0]),
  ) as ModelTypeCounts;
  counts.all = models.length;

  for (const model of models) {
    for (const filter of MODEL_TYPE_FILTERS) {
      if (filter !== 'all' && matchesModelTypeFilter(model, filter)) {
        counts[filter] += 1;
      }
    }
  }

  return counts;
}

export function filterModelsByType(models: readonly Model[], filter: ModelTypeFilter): Model[] {
  return filter === 'all'
    ? [...models]
    : models.filter((model) => matchesModelTypeFilter(model, filter));
}

// Text-to-speech is the only audio-output sub-kind that can be singled out from
// generic audio generation today — the `AUDIO_GENERATION` capability backs both,
// so the dedicated endpoint is the distinguishing signal.
function hasTextToSpeechEndpoint(model: Model): boolean {
  return model.endpointTypes?.includes(ENDPOINT_TYPE.OPENAI_TEXT_TO_SPEECH) ?? false;
}

function isEmbeddingModel(model: Model): boolean {
  return model.capabilities.includes(MODEL_CAPABILITY.EMBEDDING);
}

function isRerankModel(model: Model): boolean {
  return model.capabilities.includes(MODEL_CAPABILITY.RERANK);
}

function isGenerateImageModel(model: Model): boolean {
  return model.capabilities.includes(MODEL_CAPABILITY.IMAGE_GENERATION);
}

function isGenerateAudioModel(model: Model): boolean {
  return model.capabilities.includes(MODEL_CAPABILITY.AUDIO_GENERATION);
}

function isGenerateVideoModel(model: Model): boolean {
  return model.capabilities.includes(MODEL_CAPABILITY.VIDEO_GENERATION);
}

// Prefer the explicit transcript capability. A catalog that only exposes
// modalities still identifies a dedicated speech-to-text model by audio in and
// text out with no text input; that last guard is what keeps a multimodal chat
// model (Gemini, GPT-4o, …) out of this bucket.
function isSpeechToTextModel(model: Model): boolean {
  return (
    model.capabilities.includes(MODEL_CAPABILITY.AUDIO_TRANSCRIPT) ||
    (model.capabilities.includes(MODEL_CAPABILITY.AUDIO_RECOGNITION) &&
      model.inputModalities?.includes(MODALITY.AUDIO) === true &&
      !model.inputModalities.includes(MODALITY.TEXT) &&
      model.outputModalities?.includes(MODALITY.TEXT) === true)
  );
}

function isNonChatModel(model: Model): boolean {
  return (
    endpointImpliedCapability(model.endpointTypes?.[0]) != null ||
    isEmbeddingModel(model) ||
    isRerankModel(model) ||
    isGenerateImageModel(model) ||
    isGenerateVideoModel(model) ||
    isGenerateAudioModel(model) ||
    isSpeechToTextModel(model)
  );
}
