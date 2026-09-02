import { createUniqueModelId, type Model } from '@/shared/data/types/model';

import {
  buildProviderModelPullListItems,
  filterProviderModelPullPreview,
} from '../providerModelPullPreview';

describe('provider model pull preview helpers', () => {
  test('filters pull rows by model id and name', () => {
    const preview = {
      added: [
        model({ modelId: 'alpha-chat-v2', name: 'First Assistant' }),
        model({ modelId: 'beta-vision', name: 'Image Model' }),
      ],
      missing: [model({ modelId: 'legacy-reasoner', name: 'Alpha Reasoning' })],
    };

    expect(filterProviderModelPullPreview(preview, 'BETA').added).toEqual([preview.added[1]]);
    expect(filterProviderModelPullPreview(preview, 'alpha reasoning').missing).toEqual([
      preview.missing[0],
    ]);
    expect(filterProviderModelPullPreview(preview, 'image alpha')).toEqual({
      added: [],
      missing: [],
    });
    expect(filterProviderModelPullPreview(preview, '  ')).toBe(preview);
  });

  test('keeps both section headers visible and includes every model row', () => {
    const preview = {
      added: [model({ modelId: 'new-model' })],
      missing: [model({ modelId: 'old-model' })],
    };

    expect(
      buildProviderModelPullListItems(preview, ['added', 'missing']).map((item) => item.key),
    ).toEqual([
      'section:added',
      'model:added:openai::new-model',
      'section:missing',
      'model:missing:openai::old-model',
    ]);
  });

  test('does not include section headers without models', () => {
    expect(
      buildProviderModelPullListItems({ added: [], missing: [] }, ['added', 'missing']),
    ).toEqual([]);
  });

  test('marks the first non-empty section as the first rendered section', () => {
    const preview = {
      added: [],
      missing: [model({ modelId: 'old-model' })],
    };

    expect(buildProviderModelPullListItems(preview, ['added', 'missing'])).toEqual([
      {
        isFirstSection: true,
        key: 'section:missing',
        section: 'missing',
        type: 'section',
      },
      expect.objectContaining({
        key: 'model:missing:openai::old-model',
        type: 'model',
      }),
    ]);
  });
});

function model(input: {
  modelId: string;
  name?: string;
  presetModelId?: string;
  providerId?: string;
}): Model {
  const providerId = input.providerId ?? 'openai';
  return {
    capabilities: [],
    id: createUniqueModelId(providerId, input.modelId),
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    modelId: input.modelId,
    name: input.name ?? input.modelId,
    presetModelId: input.presetModelId,
    providerId,
    supportsStreaming: true,
  };
}
