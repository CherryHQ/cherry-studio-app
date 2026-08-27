import type { CallOverrides } from '@cherrystudio/ai-runtime/runtime';
import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { ReasoningEffortOption } from '@cherrystudio/universal/types/aiSdk';

import { providerRegistryService } from '@/backend/data/services/ProviderRegistryService';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { applyCallOverrides, buildAgentParams } from '../buildAgentParams';

function createProvider(providerId: string): Provider {
  const preset = providerRegistryService.loadProviders().find((item) => item.id === providerId);
  if (!preset) throw new Error(`Missing registry provider ${providerId}`);

  return {
    apiFeatures: {
      arrayContent: true,
      reportsActualCost: false,
      serviceTier: true,
      streamOptions: true,
      verbosity: true,
      ...preset.apiFeatures,
    },
    apiKeys: [],
    authType: 'api-key',
    defaultChatEndpoint: preset.defaultChatEndpoint ?? ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    endpointConfigs: preset.endpointConfigs,
    id: providerId,
    isEnabled: true,
    name: preset.name,
    presetProviderId: providerId,
    settings: { summaryText: 'detailed' },
  } as Provider;
}

function resolveModel(provider: Provider, apiModelId: string): Model {
  const model = providerRegistryService.resolveModels(provider.id, [apiModelId], {
    defaultChatEndpoint: provider.defaultChatEndpoint,
    presetProviderId: provider.presetProviderId,
  })[0];
  if (!model) throw new Error(`Missing registry model ${provider.id}/${apiModelId}`);
  return model;
}

function createServices() {
  return {
    provider: {
      getAuthConfig: jest.fn(async () => null),
      resolveApiKey: jest.fn(async () => ({
        apiKeySelection: { attribution: 'unknown' as const },
        value: 'test-key',
      })),
    },
  };
}

async function buildReasoningOptions(input: {
  apiModelId: string;
  callOverrides?: CallOverrides;
  providerId: string;
  selection?: ReasoningEffortOption;
}) {
  const provider = createProvider(input.providerId);
  const model = resolveModel(provider, input.apiModelId);
  const result = await buildAgentParams({
    request: {
      callOverrides: input.callOverrides,
      reasoningEffort: input.selection,
      uniqueModelId: model.id,
    },
    services: createServices(),
    provider,
    model,
  });
  return result.options.providerOptions ?? {};
}

describe('buildAgentParams assistant-less contract', () => {
  it('uses the shared normalized wire model id', async () => {
    const provider = createProvider('gemini');
    const model = {
      ...resolveModel(provider, 'gemini-2.5-flash'),
      apiModelId: 'models/gemini-2.5-flash',
    };

    const result = await buildAgentParams({
      request: { uniqueModelId: model.id },
      services: createServices(),
      provider,
      model,
    });

    expect(result.sdkConfig.modelId).toBe('gemini-2.5-flash');
  });

  it.each([ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, ENDPOINT_TYPE.OPENAI_RESPONSES])(
    'uses system instructions for the native OpenAI adapter on %s',
    async (endpointType) => {
      const provider = createProvider('openai');
      provider.defaultChatEndpoint = endpointType;
      provider.endpointConfigs = {
        ...provider.endpointConfigs,
        [endpointType]: { adapterFamily: 'openai', baseUrl: 'https://api.openai.com' },
      };
      const model = {
        ...resolveModel(provider, 'gpt-4o-mini'),
        endpointTypes: [endpointType],
      };

      const result = await buildAgentParams({
        request: { uniqueModelId: model.id },
        services: createServices(),
        provider,
        model,
      });

      expect(result.options.providerOptions).toEqual({
        openai: { systemMessageMode: 'system' },
      });
    },
  );

  it('does not allow a call override to restore the developer role', async () => {
    const provider = createProvider('openai');
    const model = resolveModel(provider, 'gpt-4o-mini');

    const result = await buildAgentParams({
      request: {
        callOverrides: {
          providerOptions: { openai: { systemMessageMode: 'developer' } },
        },
        uniqueModelId: model.id,
      },
      services: createServices(),
      provider,
      model,
    });

    expect(result.options.providerOptions).toEqual({
      openai: { systemMessageMode: 'system' },
    });
  });

  it('serializes an explicit reasoning selection', async () => {
    await expect(
      buildReasoningOptions({
        apiModelId: 'glm-5-2',
        providerId: 'zhipu',
        selection: 'xhigh',
      }),
    ).resolves.toMatchObject({
      zhipu: { reasoningEffort: 'max', thinking: { type: 'enabled' } },
    });
  });

  it('does not emit reasoning options without an explicit request selection', async () => {
    await expect(
      buildReasoningOptions({ apiModelId: 'glm-5-2', providerId: 'zhipu' }),
    ).resolves.toEqual({});
  });

  it('lets call overrides win over resolved provider options', async () => {
    await expect(
      buildReasoningOptions({
        apiModelId: 'glm-5-2',
        callOverrides: { providerOptions: { zhipu: { reasoningEffort: 'request' } } },
        providerId: 'zhipu',
        selection: 'high',
      }),
    ).resolves.toMatchObject({ zhipu: { reasoningEffort: 'request' } });
  });
});

describe('applyCallOverrides', () => {
  it('merges supported sampling and provider options', () => {
    const provider = createProvider('openai');
    const model = resolveModel(provider, 'gpt-4o-mini');

    expect(
      applyCallOverrides(
        { providerOptions: { openai: { serviceTier: 'auto' } }, standardParams: {} },
        {
          maxOutputTokens: 321,
          providerOptions: { openai: { reasoningEffort: 'low' } },
          temperature: 0.2,
          topP: 0.8,
        },
        model,
      ),
    ).toEqual({
      providerOptions: {
        openai: { reasoningEffort: 'low', serviceTier: 'auto' },
      },
      standardParams: { maxOutputTokens: 321, temperature: 0.2, topP: 0.8 },
    });
  });
});
