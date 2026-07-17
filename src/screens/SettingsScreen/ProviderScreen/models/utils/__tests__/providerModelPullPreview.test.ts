import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import { createUniqueModelId, type Model } from '@/data/types/model';
import {
  buildProviderModelPullApplyPayload,
  buildProviderModelPullListItems,
  buildProviderModelPullPreview,
  createDefaultProviderModelPullSelection,
  filterProviderModelPullPreview,
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
    expect(
      buildProviderModelPullApplyPayload(preview, createDefaultProviderModelPullSelection(preview)),
    ).toEqual({
      toAdd: [
        expect.objectContaining({
          capabilities: [MODEL_CAPABILITY.REASONING, MODEL_CAPABILITY.FUNCTION_CALL],
          modelId: 'agent/deepseek-v3.2',
          presetModelId: 'deepseek-v3-2',
        }),
      ],
      toRemove: [],
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
    expect(
      buildProviderModelPullApplyPayload(preview, createDefaultProviderModelPullSelection(preview)),
    ).toEqual({
      toAdd: [
        expect.objectContaining({
          group: 'anthropic',
          modelId: 'anthropic/claude-sonnet-4-5',
          ownedBy: 'custom',
        }),
      ],
      toRemove: [],
    });
  });

  test('default selection includes all diff rows and payload only includes selected rows', () => {
    const preview = buildProviderModelPullPreview({
      localModels: [model({ modelId: 'old-model', presetModelId: 'old-model' })],
      providerId: 'openai',
      remoteModels: [{ modelId: 'gpt-4o', name: 'GPT-4o' }],
    });
    const selection = createDefaultProviderModelPullSelection(preview);

    expect(selection.addedIds).toEqual(new Set(['openai::gpt-4o']));
    expect(selection.missingIds).toEqual(new Set(['openai::old-model']));

    selection.missingIds.clear();
    const payload = buildProviderModelPullApplyPayload(preview, selection);

    expect(payload).toEqual({
      toAdd: [
        expect.objectContaining({
          modelId: 'gpt-4o',
          name: 'GPT-4o',
          providerId: 'openai',
        }),
      ],
      toRemove: [],
    });
  });

  test('returns null apply payload when no rows are selected', () => {
    const preview = buildProviderModelPullPreview({
      localModels: [model({ modelId: 'old-model', presetModelId: 'old-model' })],
      providerId: 'openai',
      remoteModels: [{ modelId: 'gpt-4o' }],
    });

    expect(
      buildProviderModelPullApplyPayload(preview, {
        addedIds: new Set(),
        missingIds: new Set(),
      }),
    ).toBeNull();
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
