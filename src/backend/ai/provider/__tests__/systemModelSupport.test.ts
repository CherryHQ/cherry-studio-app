import { ENDPOINT_TYPE, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';

import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import { DEFAULT_API_FEATURES, type Provider } from '@/shared/data/types/provider';

import { isModelSupportedBySystem } from '../systemModelSupport';

describe('isModelSupportedBySystem', () => {
  it('accepts Pi-compatible text models', () => {
    expect(isModelSupportedBySystem(createProvider(), createModel())).toBe(true);
  });

  it('rejects text models whose endpoint cannot run through Pi', () => {
    const provider = createProvider({
      defaultChatEndpoint: ENDPOINT_TYPE.OLLAMA_CHAT,
      endpointConfigs: {
        [ENDPOINT_TYPE.OLLAMA_CHAT]: {
          adapterFamily: 'ollama',
          baseUrl: 'http://localhost:11434',
        },
      },
    });

    expect(
      isModelSupportedBySystem(
        provider,
        createModel({ endpointTypes: [ENDPOINT_TYPE.OLLAMA_CHAT] }),
      ),
    ).toBe(false);
  });

  it('accepts image models supported by the configured AI SDK adapter', () => {
    const provider = createProvider({
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION]: {
          adapterFamily: 'openai-compatible',
          baseUrl: 'https://api.example.com/v1',
        },
      },
    });
    const model = createModel({
      capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
      endpointTypes: [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION],
    });

    expect(isModelSupportedBySystem(provider, model)).toBe(true);
  });

  it('rejects image models when the configured AI SDK adapter cannot generate images', () => {
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
    const model = createModel({ capabilities: [MODEL_CAPABILITY.EMBEDDING] });

    expect(isModelSupportedBySystem(createProvider(), model)).toBe(false);
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
