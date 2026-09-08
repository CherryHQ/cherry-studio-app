import { ENDPOINT_TYPE, MODALITY, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';

import { createUniqueModelId, type Model } from '@/shared/data/types/model';

import { filterModelsByType, matchesModelTypeFilter } from '../modelTypeFilter';

const chatModel = model('gpt-4o', { capabilities: [MODEL_CAPABILITY.IMAGE_RECOGNITION] });
const imageModel = model('dall-e-3', { capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION] });
const endpointImageModel = model('gateway-image', {
  endpointTypes: [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, ENDPOINT_TYPE.OPENAI_IMAGE_EDIT],
});
const embeddingModel = model('text-embedding-3', { capabilities: [MODEL_CAPABILITY.EMBEDDING] });

describe('model type filter', () => {
  test('keeps only the two model families shipped on mobile', () => {
    expect(matchesModelTypeFilter(chatModel, 'text')).toBe(true);
    expect(matchesModelTypeFilter(imageModel, 'image')).toBe(true);
    expect(matchesModelTypeFilter(embeddingModel, 'text')).toBe(false);
    expect(matchesModelTypeFilter(embeddingModel, 'image')).toBe(false);
  });

  test('keeps image generation models out of the conversation family', () => {
    expect(matchesModelTypeFilter(imageModel, 'text')).toBe(false);
  });

  test('accepts models declared by an image endpoint even without a capability flag', () => {
    expect(matchesModelTypeFilter(endpointImageModel, 'image')).toBe(true);
    expect(matchesModelTypeFilter(endpointImageModel, 'text')).toBe(false);
  });

  test('rejects capability-only models that explicitly cannot output images', () => {
    const textOutputModel = model('mislabeled-image-model', {
      capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
      outputModalities: [MODALITY.TEXT],
    });

    expect(matchesModelTypeFilter(textOutputModel, 'image')).toBe(false);
  });

  test('leaves the list alone for the `all` tab', () => {
    const models = [chatModel, imageModel, endpointImageModel];

    expect(filterModelsByType(models, 'all')).toEqual(models);
    expect(filterModelsByType(models, 'image')).toEqual([imageModel, endpointImageModel]);
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
