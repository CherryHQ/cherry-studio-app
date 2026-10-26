import { ENDPOINT_TYPE, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';

import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import { DEFAULT_API_FEATURES, type Provider } from '@/shared/data/types/provider';

import { createSystemModelSupport, type LanguageServingSupport } from '../systemModelSupport';

function supportWith(
  supportsLanguageModel: jest.Mock,
): ReturnType<typeof createSystemModelSupport> {
  const language: LanguageServingSupport = { supportsLanguageModel };
  return createSystemModelSupport(language);
}

describe('createSystemModelSupport', () => {
  it.each([
    ['dashscope', 'qwen-image-3.0', '/api/v1/services/aigc/multimodal-generation/generation'],
    ['ppio', 'seedream-4-0', '/v3/seedream-4.0'],
    ['tokenhub', 'hy-image-v3', '/v1/wand/hunyuan-image/v3-generation'],
  ])(
    'admits %s catalog routes only when the required descriptor is available',
    (presetProviderId, modelId, endpoint) => {
      const { isModelSupportedBySystem } = supportWith(jest.fn().mockReturnValue(false));
      const provider = createProvider({ id: 'provider-copy', presetProviderId });
      const model = createModel({
        capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
        apiModelId: modelId,
        imageGeneration: { modes: { generate: { supports: {}, vendorTransport: { endpoint } } } },
      });
      expect(isModelSupportedBySystem(provider, model)).toBe(true);
      expect(isModelSupportedBySystem(provider, { ...model, imageGeneration: undefined })).toBe(
        false,
      );
    },
  );

  it.each([
    ['dashscope', 'future-image', '/api/v1/services/aigc/multimodal-generation/generation'],
    ['dashscope', 'qwen-image-3.0', '/api/v1/services/aigc/future-image/generation'],
    ['ppio', 'seedream-4-0', '/v3/new-image-protocol'],
    ['tokenhub', 'hy-image-v3', '/v1/api/image/submit'],
    ['tokenhub', 'hy-image-v3', '/v1/wand/hunyuan-image/future-generation'],
  ])(
    'does not offer unimplemented %s image routes as supported models',
    (presetProviderId, modelId, endpoint) => {
      const { isModelSupportedBySystem } = supportWith(jest.fn().mockReturnValue(false));
      expect(
        isModelSupportedBySystem(
          createProvider({ presetProviderId }),
          createModel({
            capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
            apiModelId: modelId,
            imageGeneration: {
              modes: { generate: { supports: {}, vendorTransport: { endpoint } } },
            },
          }),
        ),
      ).toBe(false);
    },
  );

  it('delegates text models to the bound language serving support', () => {
    const supportsLanguageModel = jest.fn().mockReturnValue(true);
    const { isModelSupportedBySystem } = supportWith(supportsLanguageModel);
    const provider = createProvider();
    const model = createModel();

    expect(isModelSupportedBySystem(provider, model)).toBe(true);
    expect(supportsLanguageModel).toHaveBeenCalledWith(provider, model);

    supportsLanguageModel.mockReturnValue(false);
    expect(isModelSupportedBySystem(provider, model)).toBe(false);
  });

  it('accepts endpoint-declared image models without consulting language serving', () => {
    const supportsLanguageModel = jest.fn().mockReturnValue(false);
    const { isModelSupportedBySystem } = supportWith(supportsLanguageModel);
    const provider = createProvider({
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION]: {
          adapterFamily: 'openai-compatible',
          baseUrl: 'https://api.example.com/v1',
        },
      },
    });
    const model = createModel({
      capabilities: [],
      endpointTypes: [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION],
    });

    expect(isModelSupportedBySystem(provider, model)).toBe(true);
    expect(supportsLanguageModel).not.toHaveBeenCalled();
  });

  it('rejects image models when the configured AI SDK adapter cannot generate images', () => {
    const { isModelSupportedBySystem } = supportWith(jest.fn().mockReturnValue(false));
    const provider = createProvider({
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION]: {
          adapterFamily: 'anthropic',
          baseUrl: 'https://api.example.com/v1',
        },
      },
    });
    const model = createModel({
      capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
      endpointTypes: [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION],
    });

    expect(isModelSupportedBySystem(provider, model)).toBe(false);
  });

  it('rejects models that only serve unsupported product capabilities', () => {
    const supportsLanguageModel = jest.fn().mockReturnValue(true);
    const { isModelSupportedBySystem } = supportWith(supportsLanguageModel);
    const model = createModel({ capabilities: [MODEL_CAPABILITY.EMBEDDING] });

    expect(isModelSupportedBySystem(createProvider(), model)).toBe(false);
    expect(supportsLanguageModel).not.toHaveBeenCalled();
  });

  it('filters out models whose provider is unknown', () => {
    const { filterModelsSupportedBySystem } = supportWith(jest.fn().mockReturnValue(true));
    const provider = createProvider();
    const known = createModel();
    const orphan = createModel({
      id: createUniqueModelId('missing-provider', 'test-model'),
      providerId: 'missing-provider',
    });

    expect(filterModelsSupportedBySystem([known, orphan], [provider])).toEqual([known]);
  });
});

function createProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    apiFeatures: { ...DEFAULT_API_FEATURES },
    apiKeys: [{ id: 'key-1', isEnabled: true }],
    authMethods: ['api-key'],
    authType: 'api-key',
    defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    endpointConfigs: {
      [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
        adapterFamily: 'openai-compatible',
        baseUrl: 'https://api.example.com/v1',
      },
    },
    id: 'test-provider',
    isEnabled: true,
    name: 'Test Provider',
    settings: {},
    ...overrides,
  };
}

function createModel(overrides: Partial<Model> = {}): Model {
  return {
    capabilities: [],
    endpointTypes: [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS],
    id: createUniqueModelId('test-provider', 'test-model'),
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    modelId: 'test-model',
    name: 'Test Model',
    providerId: 'test-provider',
    supportsStreaming: true,
    ...overrides,
  };
}
