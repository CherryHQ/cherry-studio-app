import { ENDPOINT_TYPE, MODEL_CAPABILITY, REASONING_EFFORT } from '@cherrystudio/provider-registry';

import {
  extractReasoningFormatTypes,
  mergePresetModel,
  ProviderRegistryService,
  providerRegistryService,
} from '../ProviderRegistryService';

describe('provider-registry-service', () => {
  test('extracts typed reasoning formats from endpoint configs', () => {
    expect(
      extractReasoningFormatTypes({
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { reasoningFormatType: 'openai-chat' },
        [ENDPOINT_TYPE.OPENAI_RESPONSES]: { reasoningFormatType: 'not-a-format' },
      }),
    ).toEqual({
      [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: 'openai-chat',
    });
  });

  test('merges preset model and provider override into runtime model', () => {
    const model = mergePresetModel(
      {
        capabilities: [MODEL_CAPABILITY.FUNCTION_CALL],
        contextWindow: 128000,
        id: 'gpt-4o',
        maxOutputTokens: 16384,
        metadata: {},
        name: 'GPT-4o',
        pricing: {
          input: { perMillionTokens: 2.5 },
          output: { perMillionTokens: 10 },
        },
        reasoning: {
          supportedEfforts: [REASONING_EFFORT.LOW, REASONING_EFFORT.HIGH],
        },
      },
      {
        capabilities: { add: [MODEL_CAPABILITY.WEB_SEARCH] },
        endpointTypes: [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS],
        limits: { maxInputTokens: 64000 },
        modelId: 'gpt-4o',
        name: 'GPT-4o Override',
        providerId: 'openai',
        replaceWith: 'gpt-4o-mini',
      },
      'openai',
      { [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: 'openai-chat' },
      ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    );

    expect(model).toMatchObject({
      capabilities: [MODEL_CAPABILITY.FUNCTION_CALL, MODEL_CAPABILITY.WEB_SEARCH],
      id: 'openai::gpt-4o',
      maxInputTokens: 64000,
      modelId: 'gpt-4o',
      name: 'GPT-4o Override',
      presetModelId: 'gpt-4o',
      providerId: 'openai',
      replaceWith: 'openai::gpt-4o-mini',
      reasoning: {
        supportedEfforts: [REASONING_EFFORT.LOW, REASONING_EFFORT.HIGH],
        type: 'openai-chat',
      },
    });
  });

  test('synthesizes standalone provider-model rows from desktop registry data', () => {
    const registryData = providerRegistryService.lookupModel('302ai', 'chatgpt-4o-latest');

    expect(registryData.presetModel).toMatchObject({
      id: 'chatgpt-4o-latest',
      name: 'chatgpt-4o-latest',
    });
    expect(registryData.registryOverride).toMatchObject({
      apiModelId: 'chatgpt-4o-latest',
      providerId: '302ai',
    });
  });

  test('returns image-generation support from override or model metadata', () => {
    expect(
      providerRegistryService.getImageGenerationSupport('aihubmix', 'ernie-irag-edit'),
    ).toBeDefined();
    expect(
      providerRegistryService.getImageGenerationSupport('dashscope', 'qwen-image'),
    ).toBeDefined();
  });

  test('exposes provider model-list and auth metadata', () => {
    const service = new ProviderRegistryService({
      findProvider: (providerId: string) =>
        providerId === 'login-provider'
          ? {
              authMethods: ['external-cli'],
              authOptional: true,
              defaultChatEndpoint: null,
              id: 'login-provider',
              metadata: { website: { official: 'https://example.com' } },
              modelListSource: 'registry',
              name: 'Login Provider',
            }
          : null,
      getProviderModelsVersion: () => 'provider-models-version',
      getProvidersVersion: () => 'providers-version',
      invalidate: () => undefined,
      loadProviders: () => [],
    } as never);

    expect(service.getProviderDisplayMetadata('login-provider')).toEqual({
      authMethods: ['external-cli'],
      authOptional: true,
      description: undefined,
      modelListSource: 'registry',
      websites: { official: 'https://example.com' },
    });
    expect(service.isRegistryProvider('login-provider')).toBe(true);
    expect(service.isRegistryProvider('custom-provider')).toBe(false);
  });
});
