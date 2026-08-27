import { ENDPOINT_TYPE, type EndpointType } from '@cherrystudio/provider-registry';

import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import { DEFAULT_API_FEATURES, type Provider } from '@/shared/data/types/provider';

import {
  LanguageServingCompatibilityError,
  requirePiLanguageBinding,
  resolveLanguageServingPlan,
} from '../languageServingPlan';

describe('resolveLanguageServingPlan', () => {
  it('classifies shared auth and Pi protocol facts without selecting credentials', () => {
    const provider = createProvider();
    const plan = resolveLanguageServingPlan(provider, createModel());

    expect(plan).toMatchObject({
      auth: { declaredMethods: ['api-key'], type: 'api-key' },
      bindings: {
        pi: { endpointType: ENDPOINT_TYPE.OPENAI_RESPONSES, status: 'supported' },
      },
      connection: {
        adapterFamily: 'openai',
        baseUrl: 'https://api.example.com/v1',
        endpointType: ENDPOINT_TYPE.OPENAI_RESPONSES,
        wireModelId: 'gpt-test',
      },
    });
    expect(JSON.stringify(plan)).not.toContain('key-1');
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
    const plan = resolveLanguageServingPlan(provider, createModel(undefined));

    expect(plan.bindings.pi).toMatchObject({
      issue: { binding: 'pi', code },
      status: 'unsupported',
    });
    expect(() => requirePiLanguageBinding(plan)).toThrow(LanguageServingCompatibilityError);
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

function createModel(
  endpointType: EndpointType | undefined = ENDPOINT_TYPE.OPENAI_RESPONSES,
): Model {
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
