import type { CallOverrides } from '@cherrystudio/ai-runtime/runtime';
import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { Assistant } from '@cherrystudio/universal/data/types/assistant';
import { DEFAULT_ASSISTANT_SETTINGS } from '@cherrystudio/universal/data/types/assistant';
import type { Model } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import type { ReasoningEffortOption } from '@cherrystudio/universal/types/aiSdk';

import { providerRegistryService } from '@/backend/data/services/ProviderRegistryService';

import { buildAgentParams } from '../buildAgentParams';

function createProvider(providerId: string): Provider {
  const preset = providerRegistryService.loadProviders().find((item) => item.id === providerId);
  if (!preset) throw new Error(`Missing registry provider ${providerId}`);

  return {
    apiFeatures: {
      arrayContent: true,
      developerRole: true,
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

function createAssistant(
  model: Model,
  selection: ReasoningEffortOption,
  customParameters: Assistant['settings']['customParameters'] = [],
): Assistant {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    description: '',
    emoji: '',
    id: '00000000-0000-4000-8000-000000000001',
    mcpServerIds: [],
    modelId: model.id,
    modelName: model.name,
    name: 'Reasoning test',
    orderKey: 'a0',
    prompt: '',
    settings: {
      ...DEFAULT_ASSISTANT_SETTINGS,
      customParameters,
      enableMaxTokens: true,
      maxTokens: 8192,
      reasoning_effort: selection,
    },
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function createServices(
  provider: Provider,
  options: { hasMcpTools?: boolean; tools?: Record<string, never> } = {},
) {
  return {
    preference: {
      get: jest.fn(async () => null),
      getMultipleRawCached: jest.fn(() => ({})),
    },
    provider: {
      getAuthConfig: jest.fn(async () =>
        provider.authType === 'iam-gcp'
          ? {
              credentials: {
                client_email: 'svc@example.com',
                private_key: '-----BEGIN PRIVATE KEY-----\nMIIabc\n-----END PRIVATE KEY-----',
              },
              location: 'us-central1',
              project: 'project-id',
              type: 'iam-gcp' as const,
            }
          : null,
      ),
      getByProviderId: jest.fn(async () => provider),
      getRotatedApiKey: jest.fn(async () => 'test-key'),
      resolveApiKey: jest.fn(async () => ({
        apiKeySelection: { attribution: 'unknown' as const },
        value: 'test-key',
      })),
    },
    tools: {
      resolveForRequest: jest.fn(async () => ({
        deferredEntries: [],
        hasMcpTools: options.hasMcpTools ?? false,
        tools: options.tools,
      })),
    },
  } as never;
}

async function buildReasoningOptions(input: {
  apiModelId: string;
  assistantSelection?: ReasoningEffortOption;
  callOverrides?: CallOverrides;
  customParameters?: Assistant['settings']['customParameters'];
  providerId: string;
  requestSelection?: ReasoningEffortOption;
}) {
  const provider = createProvider(input.providerId);
  const model = resolveModel(provider, input.apiModelId);
  const assistant =
    input.assistantSelection === undefined
      ? undefined
      : createAssistant(model, input.assistantSelection, input.customParameters);
  const result = await buildAgentParams({
    request: {
      ...(assistant && { assistantId: assistant.id }),
      callOverrides: input.callOverrides,
      reasoningEffort: input.requestSelection,
      uniqueModelId: model.id,
    },
    services: createServices(provider),
    provider,
    model,
    assistant,
  });

  return result.options.providerOptions ?? {};
}

describe('buildAgentParams reasoning contract', () => {
  it('uses the request snapshot before the assistant selection and maps to the nearest tier', async () => {
    await expect(
      buildReasoningOptions({
        apiModelId: 'glm-5-2',
        assistantSelection: 'none',
        providerId: 'zhipu',
        requestSelection: 'xhigh',
      }),
    ).resolves.toMatchObject({
      zhipu: { thinking: { type: 'enabled' }, reasoningEffort: 'max' },
    });
  });

  it("preserves Grok 4.3's explicit none selection", async () => {
    await expect(
      buildReasoningOptions({
        apiModelId: 'grok-4.3',
        assistantSelection: 'high',
        providerId: 'grok',
        requestSelection: 'none',
      }),
    ).resolves.toMatchObject({ xai: { reasoningEffort: 'none' } });
  });

  it('uses the Anthropic contract budget and sendReasoning operation', async () => {
    await expect(
      buildReasoningOptions({
        apiModelId: 'claude-haiku-4-5',
        assistantSelection: 'high',
        callOverrides: { maxOutputTokens: 8192 },
        providerId: 'anthropic',
      }),
    ).resolves.toMatchObject({
      anthropic: {
        thinking: { type: 'enabled', budgetTokens: 8191 },
        sendReasoning: true,
      },
    });
  });

  it('lets assistant custom parameters override the profile', async () => {
    await expect(
      buildReasoningOptions({
        apiModelId: 'glm-5-2',
        assistantSelection: 'high',
        customParameters: [{ name: 'reasoningEffort', type: 'string', value: 'custom' }],
        providerId: 'zhipu',
      }),
    ).resolves.toMatchObject({ zhipu: { reasoningEffort: 'custom' } });
  });

  it('lets call overrides win over profile and assistant custom parameters', async () => {
    await expect(
      buildReasoningOptions({
        apiModelId: 'glm-5-2',
        assistantSelection: 'high',
        callOverrides: { providerOptions: { zhipu: { reasoningEffort: 'request' } } },
        customParameters: [{ name: 'reasoningEffort', type: 'string', value: 'assistant' }],
        providerId: 'zhipu',
      }),
    ).resolves.toMatchObject({ zhipu: { reasoningEffort: 'request' } });
  });

  it('emits reasoning for assistant-less callers only when the request is explicit', async () => {
    await expect(
      buildReasoningOptions({
        apiModelId: 'glm-5-2',
        providerId: 'zhipu',
        requestSelection: 'none',
      }),
    ).resolves.toMatchObject({ zhipu: { thinking: { type: 'disabled' } } });
  });

  it('does not emit reasoning for an assistant-less request without an explicit snapshot', async () => {
    await expect(
      buildReasoningOptions({
        apiModelId: 'glm-5-2',
        providerId: 'zhipu',
      }),
    ).resolves.toEqual({});
  });

  it('uses the OpenAI chat reasoning profile for Vertex MaaS requests', async () => {
    const provider = { ...createProvider('vertexai'), authType: 'iam-gcp' as const };
    const model = resolveModel(provider, 'zai-org/glm-5-maas');
    const assistant = createAssistant(model, 'auto');

    const result = await buildAgentParams({
      request: {
        assistantId: assistant.id,
        reasoningEffort: 'auto',
        uniqueModelId: model.id,
      },
      services: createServices(provider),
      provider,
      model,
      assistant,
    });

    expect(result.sdkConfig.providerId).toBe('google-vertex-maas');
    expect(result.options.providerOptions).toMatchObject({
      vertex: { reasoningEffort: 'medium' },
    });
    expect(result.options.providerOptions?.vertex).not.toHaveProperty('thinkingConfig');
  });

  it('normalizes Vertex MaaS custom reasoning parameters for its OpenAI-compatible adapter', async () => {
    const provider = { ...createProvider('vertexai'), authType: 'iam-gcp' as const };
    const model = resolveModel(provider, 'zai-org/glm-5-maas');
    const assistant = createAssistant(model, 'auto', [
      { name: 'reasoning_effort', type: 'string', value: 'high' },
    ]);

    const result = await buildAgentParams({
      request: { assistantId: assistant.id, uniqueModelId: model.id },
      services: createServices(provider),
      provider,
      model,
      assistant,
    });

    expect(result.options.providerOptions?.vertex).toMatchObject({ reasoningEffort: 'high' });
    expect(result.options.providerOptions?.vertex).not.toHaveProperty('reasoning_effort');
  });

  it('adds the OVMS no-think adapter when the resolved request contains MCP tools', async () => {
    const provider = createProvider('ovms');
    const model = {
      ...resolveModel(provider, 'qwen3-8b'),
      capabilities: ['function-call' as const],
    };
    const assistant = createAssistant(model, 'default');

    const result = await buildAgentParams({
      request: { assistantId: assistant.id, uniqueModelId: model.id },
      services: createServices(provider, { hasMcpTools: true }),
      provider,
      model,
      assistant,
      shouldIncludeExternalTools: true,
    });

    expect(result.plugins.map((plugin) => plugin.name)).toContain('no-think');
  });

  it('adds citation instructions when web_fetch is the only active web tool', async () => {
    const provider = createProvider('openai');
    const model = {
      ...resolveModel(provider, 'gpt-4o'),
      capabilities: ['function-call' as const],
    };
    const assistant = createAssistant(model, 'default');
    const result = await buildAgentParams({
      request: { assistantId: assistant.id, uniqueModelId: model.id },
      services: createServices(provider, {
        tools: { web_fetch: {} as never },
      }),
      provider,
      model,
      assistant,
      shouldIncludeExternalTools: true,
    });

    expect(result.system).toContain('<citations>');
  });
});
