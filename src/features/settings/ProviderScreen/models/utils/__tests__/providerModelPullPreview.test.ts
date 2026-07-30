import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import { createUniqueModelId, type Model } from '@/shared/domain/model';
import {
  buildProviderModelPullListItems,
  buildProviderModelPullPreview,
  filterProviderModelPullPreview,
  modelToCreateModelInput,
} from '../providerModelPullPreview';

describe('provider model pull preview helpers', () => {
  test('diffs added remote models and missing preset local models', () => {
    const preview = buildProviderModelPullPreview({
      localModels: [
        model({ modelId: 'gpt-4o', presetModelId: 'gpt-4o' }),
        model({ modelId: 'old-model', presetModelId: 'old-model' }),
        model({ modelId: 'custom-local' }),
      ],
      providerId: 'openai',
      remoteModels: [
        model({ modelId: 'gpt-4o', presetModelId: 'gpt-4o' }),
        { modelId: 'gpt-4o-mini', name: 'GPT-4o mini' },
      ],
    });

    expect(preview.added.map((item) => item.id)).toEqual(['openai::gpt-4o-mini']);
    expect(preview.missing.map((item) => item.id)).toEqual(['openai::old-model']);
  });

  test('enriches added remote models with registry metadata', () => {
    const preview = buildProviderModelPullPreview({
      localModels: [],
      providerId: 'cherryin',
      registryResolver: () => ({
        presetModel: {
          capabilities: [MODEL_CAPABILITY.REASONING, MODEL_CAPABILITY.FUNCTION_CALL],
          id: 'deepseek-v3-2',
          metadata: {},
          name: 'DeepSeek-V3.2-Thinking',
        },
        registryOverride: null,
      }),
      remoteModels: [{ modelId: 'agent/deepseek-v3.2' }],
    });

    expect(preview.added[0]).toMatchObject({
      capabilities: [MODEL_CAPABILITY.REASONING, MODEL_CAPABILITY.FUNCTION_CALL],
      modelId: 'agent/deepseek-v3.2',
      name: 'DeepSeek-V3.2-Thinking',
      presetModelId: 'deepseek-v3-2',
    });
    expect(modelToCreateModelInput(preview.added[0])).toMatchObject({
      capabilities: [MODEL_CAPABILITY.REASONING, MODEL_CAPABILITY.FUNCTION_CALL],
      modelId: 'agent/deepseek-v3.2',
      presetModelId: 'deepseek-v3-2',
    });
  });

  test('keeps remote ownedBy separate from group in pull preview payload', () => {
    const preview = buildProviderModelPullPreview({
      localModels: [],
      providerId: 'cherryin',
      remoteModels: [
        {
          group: 'anthropic',
          modelId: 'anthropic/claude-sonnet-4-5',
          name: 'Claude Sonnet 4.5',
          ownedBy: 'custom',
        },
      ],
    });

    expect(preview.added[0]).toMatchObject({
      group: 'anthropic',
      modelId: 'anthropic/claude-sonnet-4-5',
      ownedBy: 'custom',
    });
    expect(modelToCreateModelInput(preview.added[0])).toMatchObject({
      group: 'anthropic',
      modelId: 'anthropic/claude-sonnet-4-5',
      ownedBy: 'custom',
    });
  });

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
