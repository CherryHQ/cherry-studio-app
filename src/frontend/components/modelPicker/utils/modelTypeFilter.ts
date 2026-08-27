import type { Model } from '@/shared/data/types/model';
import {
  hasTextToSpeechEndpoint,
  isAudioGenerationModel,
  isEmbeddingModel,
  isImageGenerationModel,
  isRerankModel,
  isSpeechToTextModel,
  isTextGenerationModel,
  isVideoGenerationModel,
} from '@/shared/utils/modelPurpose';

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
      return isTextGenerationModel(model);
    case 'image':
      return isImageGenerationModel(model);
    case 'embedding':
      return isEmbeddingModel(model);
    case 'audio':
      // "Generate audio", excluding text-to-speech, which has its own tab.
      return isAudioGenerationModel(model) && !hasTextToSpeechEndpoint(model);
    case 'video':
      return isVideoGenerationModel(model);
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
