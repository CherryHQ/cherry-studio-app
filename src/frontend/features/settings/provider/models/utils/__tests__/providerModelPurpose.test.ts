import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';

import { createUniqueModelId, type Model } from '@/shared/data/types/model';

import { buildProviderModelListItems } from '../providerModelListItems';
import {
  filterProviderModelsByPurpose,
  getEffectiveProviderModelPurpose,
  getProviderModelPurposeCounts,
  hasMultipleProviderModelPurposes,
} from '../providerModelPurpose';

const chatModel = model('chat-model');
const paintingModel = model('painting-model', [MODEL_CAPABILITY.IMAGE_GENERATION]);
const speechModel = model('speech-model', [MODEL_CAPABILITY.AUDIO_GENERATION]);
const transcriptionModel = model('transcription-model', [MODEL_CAPABILITY.AUDIO_TRANSCRIPT]);

describe('provider model purpose', () => {
  test('counts chat and painting without inventing voice models', () => {
    const models = [chatModel, paintingModel];
    const counts = getProviderModelPurposeCounts(models);

    expect(counts).toEqual({ all: 2, chat: 1, painting: 1, speech: 0, transcription: 0 });
    expect(hasMultipleProviderModelPurposes(counts)).toBe(true);
    expect(filterProviderModelsByPurpose(models, 'chat')).toEqual([chatModel]);
    expect(filterProviderModelsByPurpose(models, 'painting')).toEqual([paintingModel]);
  });

  test('keeps pulled TTS and STT visible in grouped lists and separate purpose filters', () => {
    const models = [chatModel, speechModel, transcriptionModel];
    const counts = getProviderModelPurposeCounts(models);
    expect(counts).toEqual({ all: 3, chat: 1, painting: 0, speech: 1, transcription: 1 });
    expect(hasMultipleProviderModelPurposes(counts)).toBe(true);
    expect(hasMultipleProviderModelPurposes(getProviderModelPurposeCounts([speechModel]))).toBe(
      false,
    );
    expect(filterProviderModelsByPurpose(models, 'speech')).toEqual([speechModel]);
    expect(filterProviderModelsByPurpose(models, 'transcription')).toEqual([transcriptionModel]);
    expect(
      buildProviderModelListItems(models, true)
        .filter((item) => item.type === 'model')
        .map((item) => item.model),
    ).toEqual(models);
  });

  test('falls back to all when the selected purpose no longer exists', () => {
    const counts = getProviderModelPurposeCounts([chatModel]);

    expect(getEffectiveProviderModelPurpose('painting', counts)).toBe('all');
  });

  test('groups an all-purpose list without adding row capability tags', () => {
    expect(buildProviderModelListItems([chatModel, paintingModel], true)).toEqual([
      {
        count: 1,
        isFirstSection: true,
        key: 'section:chat',
        purpose: 'chat',
        type: 'section',
      },
      { key: `model:${chatModel.id}`, model: chatModel, type: 'model' },
      {
        count: 1,
        isFirstSection: false,
        key: 'section:painting',
        purpose: 'painting',
        type: 'section',
      },
      { key: `model:${paintingModel.id}`, model: paintingModel, type: 'model' },
    ]);
  });
});

function model(modelId: string, capabilities: Model['capabilities'] = []): Model {
  return {
    capabilities,
    id: createUniqueModelId('openai', modelId),
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    modelId,
    name: modelId,
    providerId: 'openai',
    supportsStreaming: true,
  };
}
