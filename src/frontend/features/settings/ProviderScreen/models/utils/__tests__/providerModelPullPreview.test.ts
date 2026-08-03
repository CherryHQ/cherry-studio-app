import { createUniqueModelId, type Model } from '@cherrystudio/universal/data/types/model';

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

  test('keeps both section headers visible and only includes rows from expanded sections', () => {
    const preview = {
      added: [model({ modelId: 'new-model' })],
      missing: [model({ modelId: 'old-model' })],
    };

    expect(
      buildProviderModelPullListItems(preview, ['added'], ['added', 'missing']).map(
        (item) => item.key,
      ),
    ).toEqual(['section:added', 'model:added:openai::new-model', 'section:missing']);
    expect(
      buildProviderModelPullListItems(preview, [], ['added', 'missing']).map((item) => item.key),
    ).toEqual(['section:added', 'section:missing']);
  });

  // Each section draws its own card, so the placement restarts rather than
  // running across the whole list.
  test('marks the first and last row of every section', () => {
    const preview = {
      added: [model({ modelId: 'new-model' }), model({ modelId: 'other-new-model' })],
      missing: [model({ modelId: 'old-model' })],
    };

    expect(
      buildProviderModelPullListItems(preview, ['added', 'missing'], ['added', 'missing'])
        .filter((item) => item.type === 'model')
        .map((item) => [item.key, item.isFirst, item.isLast]),
    ).toEqual([
      ['model:added:openai::new-model', true, false],
      ['model:added:openai::other-new-model', false, true],
      ['model:missing:openai::old-model', true, true],
    ]);
  });

  test('only includes section headers that are configured as visible', () => {
    expect(
      buildProviderModelPullListItems({ added: [], missing: [] }, ['added', 'missing'], ['added']),
    ).toEqual([
      {
        isFirstSection: true,
        key: 'section:added',
        section: 'added',
        type: 'section',
      },
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
