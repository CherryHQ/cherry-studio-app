import { ENDPOINT_TYPE, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';

import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { getOnboardingModels } from '../onboardingModels';

function model(id: string, providerId = 'one', overrides: Partial<Model> = {}): Model {
  return {
    id: createUniqueModelId(providerId, id),
    modelId: id,
    name: id,
    providerId,
    capabilities: [],
    ...overrides,
  } as Model;
}

const providers = [
  { id: 'one', isEnabled: false },
  { id: 'two', isEnabled: true },
] as Provider[];

test('allows configuring a disabled provider without mixing in other providers or non-chat models', () => {
  const chat = model('chat');
  const image = model('image', 'one', {
    capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
    endpointTypes: [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION],
  });
  expect(
    getOnboardingModels({
      local: [model('other', 'two')],
      remote: [chat, image],
      providerId: 'one',
      providers,
    }),
  ).toEqual([chat]);
});

test('keeps saved metadata for duplicate models and excludes disabled providers from the general picker', () => {
  const saved = model('chat', 'two', { name: 'My model' });
  expect(
    getOnboardingModels({
      local: [saved, model('disabled')],
      remote: [model('chat', 'two')],
      providers,
    }),
  ).toEqual([saved]);
});
