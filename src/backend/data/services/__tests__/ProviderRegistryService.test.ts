import {
  ENDPOINT_TYPE,
  MODEL_CAPABILITY,
  REASONING_EFFORT,
  REASONING_FORMAT_PROFILES,
} from '@cherrystudio/provider-registry';

import {
  mergePresetModel,
  ProviderRegistryService,
  providerRegistryService,
  resolveReasoningProfileFromRegistry,
} from '../ProviderRegistryService';

describe('provider-registry-service', () => {
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
      REASONING_FORMAT_PROFILES['openai-chat'].wire,
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
        selectableEfforts: [REASONING_EFFORT.LOW, REASONING_EFFORT.HIGH],
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

  test('lists the seven Radeon Cloud provider-registry models', () => {
    const models = providerRegistryService.listProviderRegistryModels({
      providerId: 'radeon-cloud',
    });

    expect(models.map(({ presetModelId, apiModelId }) => [presetModelId, apiModelId])).toEqual([
      ['deepseek-v4-flash', 'DeepSeek-V4-Flash'],
      ['deepseek-v4-pro', 'DeepSeek-V4-Pro'],
      ['glm-5-1', 'GLM-5.1'],
      ['glm-5-2', 'GLM-5.2'],
      ['gpt-oss-120b', 'gpt-oss-120b'],
      ['kimi-k2-6', 'Kimi-K2.6'],
      ['qwen3-6-35b-a3b', 'Qwen3.6-35B-A3B'],
    ]);
  });

  test('projects a preset provider catalog onto a copied provider id', () => {
    const models = providerRegistryService.listProviderRegistryModels({
      presetProviderId: 'zhipu',
      providerId: 'copied-zhipu',
    });

    expect(models.length).toBeGreaterThan(0);
    expect(models.every((model) => model.providerId === 'copied-zhipu')).toBe(true);
    expect(models.every((model) => model.id.startsWith('copied-zhipu::'))).toBe(true);
  });

  test('does not inherit a catalog for a fully custom provider', () => {
    expect(
      providerRegistryService.listProviderRegistryModels({
        presetProviderId: null,
        providerId: 'fully-custom',
      }),
    ).toEqual([]);
  });

  test('loads Radeon Cloud after CherryIN', () => {
    const providerIds = providerRegistryService.loadProviders().map(({ id }) => id);

    expect(providerIds.slice(0, 2)).toEqual(['cherryin', 'radeon-cloud']);
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

  test('resolves the request-time model contract before endpoint and global profiles', () => {
    const model = providerRegistryService.resolveModels('zhipu', ['glm-5-2'], {
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      presetProviderId: 'zhipu',
    })[0];

    const resolved = providerRegistryService.resolveReasoningProfile(
      {
        defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
        id: 'zhipu',
        presetProviderId: 'zhipu',
      },
      model,
      ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    );

    expect(resolved.support?.controls).toEqual([
      { default: 'max', kind: 'effort', values: ['none', 'high', 'max'] },
    ]);
    expect(resolved.wire).toMatchObject({
      off: {
        operations: [{ target: 'thinking.type', value: { source: 'literal', value: 'disabled' } }],
      },
      effort: {
        operations: [
          { target: 'thinking.type', value: { source: 'literal', value: 'enabled' } },
          { target: 'reasoningEffort', value: { source: 'effort' } },
        ],
      },
    });
  });

  test('resolves endpoint inline wire before the global format wire', () => {
    const inlineWire = {
      effort: {
        operations: [
          {
            target: 'disable_reasoning' as const,
            value: { source: 'literal' as const, value: false },
          },
        ],
      },
    };

    expect(
      resolveReasoningProfileFromRegistry({
        endpointType: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
        format: { type: 'openai-chat', wire: inlineWire },
      }).wire,
    ).toBe(inlineWire);
    expect(
      resolveReasoningProfileFromRegistry({
        endpointType: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
        format: { type: 'openai-chat' },
      }).wire,
    ).toBe(REASONING_FORMAT_PROFILES['openai-chat'].wire);
  });
});
