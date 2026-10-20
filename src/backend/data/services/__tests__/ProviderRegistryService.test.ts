import {
  ENDPOINT_TYPE,
  MODEL_CAPABILITY,
  REASONING_EFFORT,
  REASONING_FORMAT_PROFILES,
} from '@cherrystudio/provider-registry';

import { MobileRegistryLoader } from '@/backend/data/services/MobileRegistryLoader';
import { installProviderRegistryTestSnapshot } from '@/backend/data/services/providerRegistryTestSnapshot';

import {
  mergePresetModel,
  ProviderRegistryService,
  projectRuntimeReasoning,
  providerRegistryService,
  resolveReasoningProfileFromRegistry,
} from '../ProviderRegistryService';

beforeEach(installProviderRegistryTestSnapshot);

describe('provider-registry-service', () => {
  test.each(['openai', 'anthropic', 'cherryin', 'deepseek'])(
    'resolves %s billing only for its configured catalog endpoints',
    (id) => {
      const preset = providerRegistryService
        .loadProviders()
        .find((provider) => provider.id === id)!;
      const billing = providerRegistryService.getProviderDisplayMetadata(id).websites?.billing;
      expect(billing).toMatch(/^https:\/\//);
      expect(
        providerRegistryService.getProviderBillingUrl({
          presetProviderId: id,
          endpointConfigs: preset.endpointConfigs,
        }),
      ).toBe(billing);
      const endpoint = Object.keys(preset.endpointConfigs!)[0];
      expect(
        providerRegistryService.getProviderBillingUrl({
          presetProviderId: id,
          endpointConfigs: {
            ...preset.endpointConfigs,
            [endpoint]: { baseUrl: 'https://gateway.example.com/v1' },
          },
        }),
      ).toBeUndefined();
    },
  );

  test('keeps custom, unknown, unconfigured, and metadata-free providers without billing', () => {
    for (const presetProviderId of [null, 'custom', 'ollama']) {
      expect(
        providerRegistryService.getProviderBillingUrl({
          presetProviderId,
          endpointConfigs: {
            [ENDPOINT_TYPE.OPENAI_RESPONSES]: { baseUrl: 'https://api.openai.com' },
          },
        }),
      ).toBeUndefined();
    }
    expect(
      providerRegistryService.getProviderBillingUrl({
        presetProviderId: 'openai',
        endpointConfigs: null,
      }),
    ).toBeUndefined();
  });

  test.each(['http://api.openai.com', 'not a URL', 'https://user:secret@api.openai.com'])(
    'rejects an ineligible billing connection %s',
    (baseUrl) => {
      expect(
        providerRegistryService.getProviderBillingUrl({
          presetProviderId: 'openai',
          endpointConfigs: { [ENDPOINT_TYPE.OPENAI_RESPONSES]: { baseUrl } },
        }),
      ).toBeUndefined();
    },
  );

  test('projects downloaded GPT-6.1 Sol efforts for GGAPI without changing its API model id', () => {
    const loader = new MobileRegistryLoader();
    loader.installRemoteSnapshot(
      loader.parseRemoteSnapshot({
        models: {
          version: 'v3',
          models: [
            {
              id: 'gpt-6-1-sol',
              name: 'GPT-6.1 Sol',
              capabilities: ['reasoning'],
              reasoning: {
                controls: [
                  {
                    kind: 'effort',
                    values: ['low', 'medium', 'high', 'xhigh', 'max'],
                    default: 'medium',
                  },
                ],
                supportedEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
                defaultEffort: 'medium',
              },
            },
          ],
        },
        providerModels: { version: 'v3', overrides: [] },
      }),
    );
    const service = new ProviderRegistryService(loader);
    const [model] = service.resolveModels('ggapi', ['gpt-6.1-sol'], {
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      presetProviderId: null,
    });
    expect(model).toMatchObject({
      id: 'ggapi::gpt-6.1-sol',
      apiModelId: 'gpt-6.1-sol',
      presetModelId: 'gpt-6-1-sol',
      reasoning: {
        selectableEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
        defaultEffort: 'medium',
      },
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
        capabilities: { add: [MODEL_CAPABILITY.AUDIO_RECOGNITION] },
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
      capabilities: [MODEL_CAPABILITY.FUNCTION_CALL, MODEL_CAPABILITY.AUDIO_RECOGNITION],
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

  test('keeps a provider-only price, including explicit free pricing', () => {
    const pricing = { input: { perMillionTokens: 0 }, output: { perMillionTokens: 0 } };
    const model = mergePresetModel(
      { id: 'unpriced-model', name: 'Unpriced Model', metadata: {} },
      { providerId: 'github', modelId: 'unpriced-model', pricing },
      'github',
    );
    expect(model.pricing).toEqual(pricing);
  });

  test('synthesizes standalone provider-model rows from desktop registry data', () => {
    const loader = new MobileRegistryLoader();
    loader.installRemoteSnapshot(
      loader.parseRemoteSnapshot({
        models: { version: 'standalone', models: [] },
        providerModels: {
          version: 'standalone',
          overrides: [
            {
              providerId: '302ai',
              modelId: 'chatgpt-4o-latest',
              apiModelId: 'chatgpt-4o-latest',
              name: 'chatgpt-4o-latest',
            },
          ],
        },
      }),
    );
    const registryData = new ProviderRegistryService(loader).lookupModel(
      '302ai',
      'chatgpt-4o-latest',
    );

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

  test('selects generation-specific native reasoning wires', () => {
    const geminiBudgetWire = resolveReasoningProfileFromRegistry({
      endpointType: ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
      wireDialect: 'budget',
    }).wire;
    const anthropicBudgetWire = resolveReasoningProfileFromRegistry({
      endpointType: ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
      wireDialect: 'budget',
    }).wire;

    expect(geminiBudgetWire).toBe(REASONING_FORMAT_PROFILES.gemini.budgetWire);
    expect(geminiBudgetWire.effort?.operations).toContainEqual({
      target: 'thinkingConfig.thinkingBudget',
      value: { source: 'budget' },
    });
    expect(anthropicBudgetWire).toBe(REASONING_FORMAT_PROFILES.anthropic.budgetWire);
    expect(anthropicBudgetWire.auto?.operations).toContainEqual({
      target: 'thinking.type',
      value: { source: 'literal', value: 'enabled' },
    });
  });

  test('ignores a budget dialect on single-dialect endpoint formats', () => {
    expect(
      resolveReasoningProfileFromRegistry({
        endpointType: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
        wireDialect: 'budget',
      }).wire,
    ).toBe(REASONING_FORMAT_PROFILES['openai-chat'].wire);
  });

  test('adds Responses summaries only for hosts that explicitly accept them', () => {
    const defaultWire = resolveReasoningProfileFromRegistry({
      endpointType: ENDPOINT_TYPE.OPENAI_RESPONSES,
    }).wire;
    const enabledWire = resolveReasoningProfileFromRegistry({
      endpointType: ENDPOINT_TYPE.OPENAI_RESPONSES,
      reasoningSummary: true,
    }).wire;
    const targets = (wire: typeof defaultWire) =>
      Object.values(wire).flatMap((mode) =>
        mode && typeof mode === 'object' && 'operations' in mode
          ? mode.operations.map((operation) => operation.target)
          : [],
      );

    expect(targets(defaultWire)).not.toContain('reasoningSummary');
    expect(targets(enabledWire)).toContain('reasoningSummary');
    expect(
      enabledWire.off?.operations.some((operation) => operation.target === 'reasoningSummary'),
    ).toBe(false);
    for (const key of ['default', 'auto', 'effort'] as const) {
      const summaryOperations = enabledWire[key]?.operations.filter(
        (operation) => operation.target === 'reasoningSummary',
      );
      expect(summaryOperations).toEqual([
        { target: 'reasoningSummary', value: { source: 'literal', value: 'auto' } },
        { target: 'reasoningSummary', value: { source: 'assistant-summary' } },
      ]);
    }
  });
});

test('keeps unsupported ultra effort out of Mobile defaults and selections', () => {
  const reasoning = projectRuntimeReasoning(
    { defaultEffort: 'ultra', controls: [{ kind: 'effort', values: ['high', 'ultra'] }] },
    REASONING_FORMAT_PROFILES['openai-chat'].wire,
  );
  expect(reasoning.selectableEfforts).toEqual(['high']);
  expect(reasoning.defaultEffort).toBeUndefined();
});
