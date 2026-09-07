import { ENDPOINT_TYPE, MODALITY, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';

import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';
import { isImageGenerationModel } from '@/shared/utils/modelPurpose';

import {
  buildProviderModelAddInput,
  createInitialProviderModelAddFormState,
  getDefaultProviderModelGroupName,
  getProviderChatEndpointTypes,
  getProviderModelAddCapabilities,
  getProviderModelAddEndpointOptions,
  type ProviderModelAddFormState,
} from '../providerModelAdd';

const openaiProvider = provider({
  id: 'openai',
  defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  endpointConfigs: {
    [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl: 'https://api.example.com/v1' },
  },
});
function build(
  form: Partial<ProviderModelAddFormState> = {},
  baseline?: Model,
  currentProvider = openaiProvider,
  existingModels: Model[] = [],
) {
  return buildProviderModelAddInput({
    existingModels,
    formState: { ...createInitialProviderModelAddFormState(), modelId: 'custom-model', ...form },
    provider: currentProvider,
    baseline,
  });
}
function catalogModel(id: string, overrides: Partial<Model> = {}): Model {
  return { ...model(id), presetModelId: id, ...overrides };
}

describe('provider model add helpers', () => {
  test('derives existing group defaults', () => {
    expect(getDefaultProviderModelGroupName('Qwen/Qwen3-32B')).toBe('qwen');
    expect(getDefaultProviderModelGroupName('gpt-3.5-turbo')).toBe('gpt-3.5');
    expect(getDefaultProviderModelGroupName('deepseek-r1', 'silicon')).toBe('deepseek');
  });

  test('starts with automatic routing and no capability overrides', () => {
    expect(createInitialProviderModelAddFormState()).toMatchObject({
      capabilities: {},
      endpointType: 'auto',
    });
    expect(build().input).toEqual({
      modelId: 'custom-model',
      providerId: 'openai',
      name: 'custom-model',
      group: 'custom-model',
    });
  });

  test('preserves catalog name, group, hidden capabilities and routing by omission', () => {
    const baseline = catalogModel('custom-model', {
      name: 'Catalog name',
      group: 'Catalog group',
      capabilities: [
        MODEL_CAPABILITY.IMAGE_RECOGNITION,
        MODEL_CAPABILITY.REASONING,
        MODEL_CAPABILITY.FUNCTION_CALL,
      ],
      endpointTypes: [ENDPOINT_TYPE.OPENAI_RESPONSES],
    });
    expect(build({}, baseline).input).toEqual({ modelId: 'custom-model', providerId: 'openai' });
  });

  test('adds vision without erasing reasoning, tools or other modalities', () => {
    const baseline = catalogModel('custom-model', {
      capabilities: [MODEL_CAPABILITY.REASONING, MODEL_CAPABILITY.FUNCTION_CALL],
      inputModalities: [MODALITY.TEXT, MODALITY.AUDIO],
    });
    expect(build({ capabilities: { vision: true } }, baseline).input).toMatchObject({
      capabilities: [
        MODEL_CAPABILITY.REASONING,
        MODEL_CAPABILITY.FUNCTION_CALL,
        MODEL_CAPABILITY.IMAGE_RECOGNITION,
      ],
      inputModalities: [MODALITY.TEXT, MODALITY.AUDIO, MODALITY.IMAGE],
    });
  });

  test('can remove inherited vision without erasing tools', () => {
    const baseline = catalogModel('custom-model', {
      capabilities: [MODEL_CAPABILITY.IMAGE_RECOGNITION, MODEL_CAPABILITY.FUNCTION_CALL],
      inputModalities: [MODALITY.TEXT, MODALITY.IMAGE],
    });
    expect(build({ capabilities: { vision: false } }, baseline).input).toMatchObject({
      capabilities: [MODEL_CAPABILITY.FUNCTION_CALL],
      inputModalities: [MODALITY.TEXT],
    });
  });

  test('derives the drawing label from an explicit image endpoint', () => {
    expect(
      getProviderModelAddCapabilities({
        ...createInitialProviderModelAddFormState(),
        endpointType: ENDPOINT_TYPE.OPENAI_IMAGE_EDIT,
      }),
    ).toEqual({ drawing: true, vision: false });
  });

  test.each([ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION, ENDPOINT_TYPE.OPENAI_IMAGE_EDIT])(
    'saves %s as drawing without implying visual understanding',
    (endpointType) => {
      const result = build({ endpointType });
      expect(result.errors).toEqual({});
      expect(result.input).toMatchObject({
        capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
        endpointTypes: [endpointType],
        outputModalities: [MODALITY.IMAGE],
      });
      if (endpointType === ENDPOINT_TYPE.OPENAI_IMAGE_EDIT)
        expect(result.input?.inputModalities).toContain(MODALITY.IMAGE);
      expect(result.input?.capabilities).not.toContain(MODEL_CAPABILITY.IMAGE_RECOGNITION);
      expect(isImageGenerationModel({ ...model('custom-model'), ...result.input })).toBe(true);
    },
  );

  test('adds both tags and uses the supported OpenAI image fallback', () => {
    expect(build({ capabilities: { vision: true, drawing: true } }).input).toMatchObject({
      capabilities: [MODEL_CAPABILITY.IMAGE_RECOGNITION, MODEL_CAPABILITY.IMAGE_GENERATION],
      endpointTypes: [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION],
      inputModalities: [MODALITY.TEXT, MODALITY.IMAGE],
      outputModalities: [MODALITY.IMAGE],
    });
  });

  test('keeps a native Gemini drawing route automatic', () => {
    const baseline = catalogModel('custom-model', {
      capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
      endpointTypes: [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT],
      outputModalities: [MODALITY.TEXT, MODALITY.IMAGE],
    });
    const result = build({ capabilities: { vision: true } }, baseline);
    expect(result.errors).toEqual({});
    expect(result.input).not.toHaveProperty('endpointTypes');
    expect(result.input?.capabilities).toEqual([
      MODEL_CAPABILITY.IMAGE_GENERATION,
      MODEL_CAPABILITY.IMAGE_RECOGNITION,
    ]);
    expect(result.input).not.toHaveProperty('outputModalities');
  });

  test('does not invent image support from a non-OpenAI text URL', () => {
    const anthropic = provider({
      id: 'anthropic',
      defaultChatEndpoint: ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
      endpointConfigs: {
        [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: { baseUrl: 'https://anthropic.example.com' },
      },
    });
    expect(getProviderModelAddEndpointOptions(anthropic).map(({ id }) => id)).toEqual([
      ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
    ]);
    expect(
      build({ capabilities: { drawing: true } }, undefined, anthropic).errors.endpointType,
    ).toBe('settings.provider.models.addImageEndpointRequired');
  });

  test('does not allow a drawing tag to override an explicit incompatible protocol', () => {
    expect(
      build({
        capabilities: { drawing: true },
        endpointType: ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
      }).errors.endpointType,
    ).toBe('settings.provider.models.addImageEndpointRequired');
  });

  test('cannot remove drawing while an inherited image endpoint still requires it', () => {
    const baseline = catalogModel('custom-model', {
      capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
      endpointTypes: [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION],
    });
    expect(build({ capabilities: { drawing: false } }, baseline).errors.endpointType).toBe(
      'settings.provider.models.addImageEndpointConflict',
    );
    const switched = build(
      { capabilities: { drawing: false }, endpointType: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS },
      baseline,
    );
    expect(switched.errors).toEqual({});
    expect(switched.input).toMatchObject({
      capabilities: [],
      outputModalities: [MODALITY.TEXT],
    });
  });

  test('retains image-edit input when vision is disabled', () => {
    const baseline = catalogModel('custom-model', {
      capabilities: [MODEL_CAPABILITY.IMAGE_RECOGNITION, MODEL_CAPABILITY.IMAGE_GENERATION],
      endpointTypes: [ENDPOINT_TYPE.OPENAI_IMAGE_EDIT],
      inputModalities: [MODALITY.IMAGE],
    });
    expect(build({ capabilities: { vision: false } }, baseline).input?.inputModalities).toEqual([
      MODALITY.IMAGE,
    ]);
  });

  test.each(['0', '-1', '1.5', '1e3', 'NaN', '9007199254740992'])(
    'rejects invalid numeric input %s without silently dropping it',
    (value) => {
      expect(build({ contextWindow: value }).errors.contextWindow).toBe(
        'settings.provider.models.addPositiveInteger',
      );
    },
  );

  test('validates positive limits and inherited context/output combinations', () => {
    expect(
      build({ contextWindow: '128000', maxInputTokens: '64000', maxOutputTokens: '8192' }).input,
    ).toMatchObject({
      contextWindow: 128000,
      maxInputTokens: 64000,
      maxOutputTokens: 8192,
    });
    const baseline = catalogModel('custom-model', { contextWindow: 16000, maxOutputTokens: 8000 });
    expect(build({ maxOutputTokens: '16000' }, baseline).errors.maxOutputTokens).toBe(
      'settings.provider.models.addOutputLimitError',
    );
    expect(build({ contextWindow: '8000' }, baseline).errors.maxOutputTokens).toBe(
      'settings.provider.models.addOutputLimitError',
    );
    expect(build({ maxInputTokens: '16001' }, baseline).errors.maxInputTokens).toBe(
      'settings.provider.models.addInputLimitError',
    );
  });

  test('omits inapplicable token limits for drawing', () => {
    const result = build({
      capabilities: { drawing: true },
      contextWindow: '1.5',
      maxOutputTokens: '0',
    });
    expect(result.errors).toEqual({});
    expect(result.input).not.toHaveProperty('contextWindow');
    expect(result.input).not.toHaveProperty('maxOutputTokens');
  });

  test('includes app fallbacks when only one token limit is entered', () => {
    expect(build({ contextWindow: '8192' }).errors.maxOutputTokens).toBe(
      'settings.provider.models.addOutputLimitError',
    );
    expect(build({ maxOutputTokens: '128000' }).errors.maxOutputTokens).toBe(
      'settings.provider.models.addOutputLimitError',
    );
    expect(build({ contextWindow: '8193' }).errors).toEqual({});
  });

  test('adds image input when the only configured drawing route is editing', () => {
    const editProvider = provider({
      id: 'openai',
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_IMAGE_EDIT]: { baseUrl: 'https://images.example.com' },
      },
    });
    const result = build({ capabilities: { drawing: true } }, undefined, editProvider);
    expect(result.errors).toEqual({});
    expect(result.input).toMatchObject({
      endpointTypes: [ENDPOINT_TYPE.OPENAI_IMAGE_EDIT],
      inputModalities: [MODALITY.TEXT, MODALITY.IMAGE],
    });
  });

  test.each(['chat,image', 'chat，image', 'same,same', 'model,', 'chat\nimage'])(
    'rejects multiple IDs instead of splitting or partially creating %s',
    (modelId) => {
      expect(build({ modelId })).toEqual({
        errors: { modelId: 'settings.provider.models.addSingleModelOnly' },
      });
    },
  );

  test.each(['bad?x', 'bad#x'])('rejects reserved characters in %s', (modelId) => {
    expect(build({ modelId })).toEqual({
      errors: { modelId: 'settings.provider.models.addInvalidId' },
    });
  });

  test.each(['Qwen/Qwen3', 'qwen3:32b'])('accepts a single ID %s', (modelId) => {
    expect(build({ modelId: `  ${modelId}  ` }).input?.modelId).toBe(modelId);
  });

  test('requires a model ID and rejects an existing model', () => {
    expect(build({ modelId: '  ' }).errors.modelId).toBe(
      'settings.provider.models.addModelIdRequired',
    );
    expect(build({}, undefined, openaiProvider, [model('custom-model')])).toEqual({
      errors: { modelId: 'settings.provider.models.addDuplicate' },
    });
  });

  test('keeps the requested alias while inheriting its canonical catalog model', () => {
    expect(build({ modelId: 'provider-alias' }, catalogModel('canonical')).input).toEqual({
      modelId: 'provider-alias',
      providerId: 'openai',
    });
  });

  test('chat endpoint choices exclude image and unconfigured endpoints', () => {
    expect(
      getProviderChatEndpointTypes({
        defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_RESPONSES,
        endpointConfigs: {
          [ENDPOINT_TYPE.OPENAI_RESPONSES]: { baseUrl: 'https://responses.example.com' },
          [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: { baseUrl: 'https://anthropic.example.com' },
          [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT]: { baseUrl: '' },
          [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION]: { baseUrl: 'https://images.example.com' },
        },
      }),
    ).toEqual([ENDPOINT_TYPE.OPENAI_RESPONSES, ENDPOINT_TYPE.ANTHROPIC_MESSAGES]);
  });
});

function model(modelId: string, providerId = 'openai'): Model {
  return {
    capabilities: [],
    id: createUniqueModelId(providerId, modelId),
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    modelId,
    name: modelId,
    providerId,
    supportsStreaming: true,
  };
}

function provider(input: Partial<Provider> & { id: string }): Provider {
  return {
    apiFeatures: {
      arrayContent: true,
      serviceTier: true,
      streamOptions: true,
      verbosity: false,
      reportsActualCost: false,
    },
    apiKeys: [],
    authType: 'api-key',
    isEnabled: true,
    name: input.id,
    settings: {},
    ...input,
  };
}
