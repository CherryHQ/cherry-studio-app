import { ENDPOINT_TYPE, MODALITY, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import { createUniqueModelId, type Model } from '@cherrystudio/universal/data/types/model';

import {
  filterModelsByProviderModelType,
  getProviderModelTypeCounts,
  matchesProviderModelTypeFilter,
} from '../providerModelTypeFilter';

const chatModel = model('gpt-4o', { capabilities: [MODEL_CAPABILITY.IMAGE_RECOGNITION] });
const imageModel = model('dall-e-3', { capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION] });
const embeddingModel = model('text-embedding-3', { capabilities: [MODEL_CAPABILITY.EMBEDDING] });
const rerankModel = model('rerank-v3', { capabilities: [MODEL_CAPABILITY.RERANK] });
const videoModel = model('sora', { capabilities: [MODEL_CAPABILITY.VIDEO_GENERATION] });
const speechModel = model('tts-1', {
  capabilities: [MODEL_CAPABILITY.AUDIO_GENERATION],
  endpointTypes: [ENDPOINT_TYPE.OPENAI_TEXT_TO_SPEECH],
});
const audioModel = model('audio-preview', { capabilities: [MODEL_CAPABILITY.AUDIO_GENERATION] });
const transcriptionModel = model('whisper-1', {
  capabilities: [MODEL_CAPABILITY.AUDIO_TRANSCRIPT],
});

describe('provider model type filter', () => {
  test('sorts each model into the type it exists for', () => {
    expect(matchesProviderModelTypeFilter(chatModel, 'text')).toBe(true);
    expect(matchesProviderModelTypeFilter(imageModel, 'image')).toBe(true);
    expect(matchesProviderModelTypeFilter(embeddingModel, 'embedding')).toBe(true);
    expect(matchesProviderModelTypeFilter(rerankModel, 'rerank')).toBe(true);
    expect(matchesProviderModelTypeFilter(videoModel, 'video')).toBe(true);
    expect(matchesProviderModelTypeFilter(speechModel, 'speech')).toBe(true);
    expect(matchesProviderModelTypeFilter(transcriptionModel, 'transcription')).toBe(true);
  });

  test('keeps non-chat models out of the text tab', () => {
    for (const nonChatModel of [imageModel, embeddingModel, rerankModel, videoModel, speechModel]) {
      expect(matchesProviderModelTypeFilter(nonChatModel, 'text')).toBe(false);
    }
  });

  // `AUDIO_GENERATION` backs both, so only the endpoint separates them.
  test('splits text-to-speech off from generic audio generation', () => {
    expect(matchesProviderModelTypeFilter(audioModel, 'audio')).toBe(true);
    expect(matchesProviderModelTypeFilter(audioModel, 'speech')).toBe(false);
    expect(matchesProviderModelTypeFilter(speechModel, 'audio')).toBe(false);
  });

  // Audio in, text out, no text in — a dedicated transcriber, not a chat model
  // that happens to hear.
  test('reads a modality-only transcriber as transcription', () => {
    const modalityOnly = model('asr-preview', {
      capabilities: [MODEL_CAPABILITY.AUDIO_RECOGNITION],
      inputModalities: [MODALITY.AUDIO],
      outputModalities: [MODALITY.TEXT],
    });
    const multimodalChat = model('gpt-4o-audio', {
      capabilities: [MODEL_CAPABILITY.AUDIO_RECOGNITION],
      inputModalities: [MODALITY.TEXT, MODALITY.AUDIO],
      outputModalities: [MODALITY.TEXT],
    });

    expect(matchesProviderModelTypeFilter(modalityOnly, 'transcription')).toBe(true);
    expect(matchesProviderModelTypeFilter(multimodalChat, 'transcription')).toBe(false);
    expect(matchesProviderModelTypeFilter(multimodalChat, 'text')).toBe(true);
  });

  test('counts every type, and counts `all` as the total rather than the sum', () => {
    const counts = getProviderModelTypeCounts([chatModel, imageModel, embeddingModel, speechModel]);

    expect(counts).toEqual({
      all: 4,
      audio: 0,
      embedding: 1,
      image: 1,
      rerank: 0,
      speech: 1,
      text: 1,
      transcription: 0,
      video: 0,
    });
  });

  test('leaves the list alone for the `all` tab', () => {
    const models = [chatModel, imageModel];

    expect(filterModelsByProviderModelType(models, 'all')).toEqual(models);
    expect(filterModelsByProviderModelType(models, 'image')).toEqual([imageModel]);
  });
});

function model(modelId: string, overrides: Partial<Model>): Model {
  return {
    capabilities: [],
    id: createUniqueModelId('openai', modelId),
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    modelId,
    name: modelId,
    providerId: 'openai',
    supportsStreaming: true,
    ...overrides,
  };
}
