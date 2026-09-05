import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { Assistant } from '@cherrystudio/universal/data/types/assistant';
import type { Model, UniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';

import {
  applyFastModeToProviderOptions,
  applyServiceTierToProviderOptions,
  buildCapabilityProviderOptions,
  normalizeServiceTierSelection,
  resolveServiceTierWireValue,
  type ServiceTierWireControl,
} from '../options';

const serviceTierControl: ServiceTierWireControl = {
  default: 'standard',
  options: ['standard', 'auto', 'fast', 'flex'],
  wire: {
    delivery: { key: 'serviceTier', type: 'provider-option' },
    values: { standard: 'on_demand', auto: 'auto', fast: 'performance', flex: 'flex' },
  },
};

describe('applyFastModeToProviderOptions', () => {
  it('uses OpenAI priority service tier only for supported provider-model pairs', () => {
    expect(
      applyFastModeToProviderOptions(
        { fastMode: { transport: 'openai-priority' } },
        { supportsFastMode: true },
        { openai: { reasoningEffort: 'high' } },
        true,
      ),
    ).toEqual({ openai: { reasoningEffort: 'high', serviceTier: 'priority' } });
  });

  it('does not change provider options when fast mode is unavailable', () => {
    const providerOptions = { openai: { reasoningEffort: 'high' } };
    expect(
      applyFastModeToProviderOptions(
        { fastMode: { transport: 'openai-priority' } },
        { supportsFastMode: false },
        providerOptions,
        true,
      ),
    ).toBe(providerOptions);
  });

  it('serializes registry-owned service-tier values without provider-id branches', () => {
    expect(
      applyServiceTierToProviderOptions(
        { groq: { parallelToolCalls: true } },
        'groq',
        serviceTierControl,
        'fast',
      ),
    ).toEqual({ groq: { parallelToolCalls: true, serviceTier: 'performance' } });
  });

  it('accepts legacy persisted wire values during the registry migration', () => {
    expect(normalizeServiceTierSelection(serviceTierControl, 'on_demand')).toBe('standard');
    expect(normalizeServiceTierSelection(serviceTierControl, 'performance')).toBe('fast');
    expect(resolveServiceTierWireValue(serviceTierControl, undefined)).toBe('on_demand');
  });

  it('adds the configured context window beside Ollama reasoning options', () => {
    const result = buildCapabilityProviderOptions(
      { settings: {} } as Assistant,
      createModel({ contextWindow: 32_768 }),
      createProvider('ollama'),
      { enableGenerateImage: false, enableReasoning: true, enableWebSearch: false },
      {
        aiSdkProviderId: 'ollama',
        endpointType: ENDPOINT_TYPE.OLLAMA_CHAT,
        providerOptionsKey: 'ollama',
        reasoning: {
          emissions: [{ target: 'think', value: true }],
          kind: 'auto',
          selection: 'auto',
        },
        runtimeProviderId: 'ollama',
      },
    );

    expect(result).toEqual({ ollama: { options: { num_ctx: 32_768 }, think: true } });
  });

  it('uses the Vertex namespace for Gemini defaults and reasoning', () => {
    const result = buildCapabilityProviderOptions(
      { settings: {} } as Assistant,
      createModel(),
      createProvider('vertexai'),
      { enableGenerateImage: false, enableReasoning: true, enableWebSearch: false },
      {
        aiSdkProviderId: 'google-vertex',
        endpointType: ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
        providerOptionsKey: 'vertex',
        reasoning: {
          emissions: [{ target: 'thinkingConfig.thinkingBudget', value: 4096 }],
          kind: 'budget',
          budgetTokens: 4096,
          selection: 'high',
        },
        runtimeProviderId: 'google-vertex',
      },
    );

    expect(result.vertex).toMatchObject({
      safetySettings: expect.any(Array),
      thinkingConfig: { thinkingBudget: 4096 },
    });
    expect(result.google).toBeUndefined();
  });

  it('does not send the direct-Anthropic interleaved-thinking beta to Bedrock', () => {
    const result = buildCapabilityProviderOptions(
      { settings: {} } as Assistant,
      createModel({ modelId: 'claude-sonnet-4-5' }),
      { ...createProvider('aws-bedrock'), authType: 'iam-aws' },
      { enableGenerateImage: false, enableReasoning: true, enableWebSearch: false },
      {
        aiSdkProviderId: 'bedrock',
        endpointType: ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
        providerOptionsKey: 'bedrock',
        reasoning: {
          emissions: [],
          kind: 'auto',
          selection: 'auto',
        },
        runtimeProviderId: 'bedrock',
      },
    );

    expect(result.bedrock).not.toHaveProperty('anthropicBeta');
  });
});

function createModel(overrides: Partial<Model> = {}): Model {
  return {
    capabilities: [],
    id: 'provider::model' as UniqueModelId,
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    modelId: 'model',
    name: 'Model',
    providerId: 'provider',
    supportsStreaming: true,
    ...overrides,
  };
}

function createProvider(id: string): Provider {
  return {
    apiFeatures: {
      arrayContent: true,
      reportsActualCost: false,
      serviceTier: false,
      streamOptions: true,
      verbosity: false,
    },
    apiKeys: [],
    authType: 'api-key',
    endpointConfigs: {},
    id,
    isEnabled: true,
    name: id,
    settings: {},
  };
}
