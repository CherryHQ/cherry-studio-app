import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';

import { createUniqueModelId, type Model } from '@/shared/data/types/model';

import { getProviderModelBadges } from '../providerModelBadges';

describe('provider model badges', () => {
  it('keeps only free and vision in a stable priority order', () => {
    const model = createModel({
      capabilities: [MODEL_CAPABILITY.REASONING, MODEL_CAPABILITY.IMAGE_RECOGNITION],
      modelId: 'agent/model:free',
    });

    expect(getProviderModelBadges(model)).toEqual(['free', 'vision']);
  });

  it('does not claim vision from catalog modalities without runtime capability support', () => {
    const model = createModel({ inputModalities: ['text', 'image'] });

    expect(getProviderModelBadges(model)).toEqual([]);
  });

  it('recognizes explicit free variants without matching ordinary words', () => {
    expect(getProviderModelBadges(createModel({ modelId: 'model(free)' }))).toEqual(['free']);
    expect(getProviderModelBadges(createModel({ modelId: 'model-freestyle' }))).toEqual([]);
  });

  it('keeps CherryAI models free without relying on their names', () => {
    expect(getProviderModelBadges(createModel({ providerId: 'CherryAI' }))).toEqual(['free']);
  });
});

function createModel({
  capabilities = [],
  inputModalities,
  modelId = 'model',
  providerId = 'provider',
}: {
  capabilities?: Model['capabilities'];
  inputModalities?: Model['inputModalities'];
  modelId?: string;
  providerId?: string;
} = {}): Model {
  return {
    capabilities,
    id: createUniqueModelId(providerId, modelId),
    inputModalities,
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    modelId,
    name: 'Display name',
    providerId,
    supportsStreaming: true,
  };
}
