import { ENDPOINT_TYPE, type EndpointType } from '@cherrystudio/provider-registry';

import { resolveProviderConnection } from '@/backend/ai/provider/providerConnection';
import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import { DEFAULT_API_FEATURES, type Provider } from '@/shared/data/types/provider';

import {
  LanguageServingCompatibilityError,
  requirePiLanguageBinding,
  resolvePiLanguageBinding,
  supportsPiLanguageModel,
} from '../piLanguageBinding';

describe('resolvePiLanguageBinding', () => {
  it('classifies Pi protocol facts without selecting credentials', () => {
    const provider = createProvider();
    const model = createModel(ENDPOINT_TYPE.OPENAI_RESPONSES);
    const connection = resolveProviderConnection(provider, model);
    const binding = resolvePiLanguageBinding(provider, connection);

    expect(binding).toEqual({
      endpointType: ENDPOINT_TYPE.OPENAI_RESPONSES,
      status: 'supported',
    });
    expect(connection).toMatchObject({
      adapterFamily: 'openai',
      baseUrl: 'https://api.example.com/v1',
      endpointType: ENDPOINT_TYPE.OPENAI_RESPONSES,
      wireModelId: 'gpt-test',
    });
    expect(JSON.stringify({ binding, connection })).not.toContain('key-1');
  });

  it.each([
    {
      code: 'unsupported-endpoint',
      provider: createProvider({
        defaultChatEndpoint: ENDPOINT_TYPE.OLLAMA_CHAT,
        endpointConfigs: {
          [ENDPOINT_TYPE.OLLAMA_CHAT]: {
            adapterFamily: 'ollama',
            baseUrl: 'http://localhost:11434',
          },
        },
      }),
    },
    {
      code: 'unsupported-adapter-family',
      provider: createProvider({
        endpointConfigs: {
          [ENDPOINT_TYPE.OPENAI_RESPONSES]: {
            adapterFamily: 'azure-responses',
            baseUrl: 'https://azure.example.com',
          },
        },
      }),
    },
    {
      code: 'unsupported-auth-type',
      provider: createProvider({ authType: 'iam-aws' }),
    },
    {
      code: 'unsupported-auth-flow',
      provider: createProvider({ authMethods: ['oauth'] }),
    },
    {
      code: 'missing-base-url',
      provider: createProvider({
        endpointConfigs: {
          [ENDPOINT_TYPE.OPENAI_RESPONSES]: {
            adapterFamily: 'openai',
            baseUrl: '',
          },
        },
      }),
    },
    {
      code: 'custom-endpoint-path',
      provider: createProvider({
        endpointConfigs: {
          [ENDPOINT_TYPE.OPENAI_RESPONSES]: {
            adapterFamily: 'openai',
            baseUrl: 'https://api.example.com/responses#',
          },
        },
      }),
    },
  ] as const)('returns a typed Pi compatibility issue for $code', ({ code, provider }) => {
    const model = createModel(undefined);
    const binding = resolvePiLanguageBinding(provider, resolveProviderConnection(provider, model));

    expect(binding).toMatchObject({
      issue: { binding: 'pi', code },
      status: 'unsupported',
    });
    expect(() => requirePiLanguageBinding(binding)).toThrow(LanguageServingCompatibilityError);
  });
});

describe('supportsPiLanguageModel', () => {
  it('accepts a model on a Pi-compatible endpoint', () => {
    const provider = createProvider();
    expect(supportsPiLanguageModel(provider, createModel(ENDPOINT_TYPE.OPENAI_RESPONSES))).toBe(
      true,
    );
  });

  it('rejects a model whose endpoint cannot run through Pi', () => {
    const provider = createProvider({
      defaultChatEndpoint: ENDPOINT_TYPE.OLLAMA_CHAT,
      endpointConfigs: {
        [ENDPOINT_TYPE.OLLAMA_CHAT]: {
          adapterFamily: 'ollama',
          baseUrl: 'http://localhost:11434',
        },
      },
    });

    expect(supportsPiLanguageModel(provider, createModel(ENDPOINT_TYPE.OLLAMA_CHAT))).toBe(false);
  });
});

function createProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    apiFeatures: { ...DEFAULT_API_FEATURES },
    apiKeys: [{ id: 'key-1', isEnabled: true }],
    authMethods: ['api-key'],
    authType: 'api-key',
    defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_RESPONSES,
    endpointConfigs: {
      [ENDPOINT_TYPE.OPENAI_RESPONSES]: {
        adapterFamily: 'openai',
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

function createModel(endpointType: EndpointType | undefined): Model {
  return {
    capabilities: [],
    endpointTypes: endpointType ? [endpointType] : undefined,
    id: createUniqueModelId('test-provider', 'gpt-test'),
    isEnabled: true,
    isHidden: false,
    modelId: 'gpt-test',
    name: 'GPT Test',
    providerId: 'test-provider',
    supportsStreaming: true,
  };
}
