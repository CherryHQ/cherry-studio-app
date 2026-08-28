import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';

import type { ResolvedProviderApiKey } from '@/backend/data/services/ProviderService';
import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import type { AuthConfig, Provider } from '@/shared/data/types/provider';

import { providerToAiSdkConfig, resolveProviderAiSdkConfig } from '../providerConfig';

describe('providerToAiSdkConfig', () => {
  it('leaves generic OpenAI-compatible providers on the default fetch', async () => {
    const provider = createProvider({
      id: 'custom-openai',
      presetProviderId: undefined,
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
          baseUrl: 'https://example.com/v1',
        },
      },
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    });
    const model = createModel(provider.id, 'custom-model');

    const config = await providerToAiSdkConfig(provider, model, createRuntime());

    expect(config.providerId).toBe('openai-compatible');
    expect(config.providerSettings.fetch).toBeUndefined();
  });

  it('resolves registered adapter extensions before falling back to openai-compatible', async () => {
    const provider = createProvider({
      id: 'together',
      presetProviderId: 'together',
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
          adapterFamily: 'togetherai',
          baseUrl: 'https://api.together.ai',
        },
      },
    });

    const config = await providerToAiSdkConfig(
      provider,
      createModel(provider.id, 'zai-org/GLM-5'),
      createRuntime(),
    );

    expect(config.providerId).toBe('togetherai');
  });

  it('adds X-Source only to Radeon Cloud chat request headers', async () => {
    const radeonProvider = createProvider({
      id: 'radeon-cloud',
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
          adapterFamily: 'openai-compatible',
          baseUrl: 'https://developer.amd.com.cn/radeon/v1',
        },
      },
    });
    const openAIProvider = createProvider({
      id: 'openai',
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
          adapterFamily: 'openai-compatible',
          baseUrl: 'https://api.openai.com/v1',
        },
      },
    });

    const radeonConfig = await providerToAiSdkConfig(
      radeonProvider,
      createModel(radeonProvider.id, 'DeepSeek-V4-Flash'),
      createRuntime(),
    );
    const openAIConfig = await providerToAiSdkConfig(
      openAIProvider,
      createModel(openAIProvider.id, 'gpt-4o'),
      createRuntime(),
    );

    expect(radeonConfig.providerSettings.headers).toMatchObject({
      'X-Source': 'cherry-studio',
    });
    expect(openAIConfig.providerSettings.headers).not.toHaveProperty('X-Source');
    expect(radeonConfig.providerSettings).not.toHaveProperty('source');
    expect(radeonConfig.providerSettings).not.toHaveProperty('request_source');
  });

  it('returns the exact serving credential receipt with the provider config', async () => {
    const provider = createProvider({ id: 'custom-openai' });
    const model = createModel(provider.id, 'custom-model');
    const runtime = createRuntime({
      value: 'raw-secret-key',
      apiKeySelection: {
        attribution: 'explicit',
        id: 'key-1',
        label: 'Primary',
        masked: 'ra****ey',
      },
    });

    const resolved = await resolveProviderAiSdkConfig(provider, model, runtime);

    expect(resolved.config.providerSettings).toMatchObject({ apiKey: 'raw-secret-key' });
    expect(resolved.credentialReceipt).toEqual({
      attribution: 'explicit',
      id: 'key-1',
      label: 'Primary',
      masked: 'ra****ey',
    });
  });

  it('passes caller overrides to the atomic credential selector', async () => {
    const provider = createProvider({ id: 'custom-openai' });
    const model = createModel(provider.id, 'custom-model');
    const runtime = createRuntime({
      value: 'override-key',
      apiKeySelection: { attribution: 'unknown' },
    });

    await resolveProviderAiSdkConfig(provider, model, runtime, {
      apiKeyOverride: 'override-key',
    });

    expect(runtime.resolveApiKey).toHaveBeenCalledWith(provider.id, 'override-key');
  });

  it('builds native Ollama config without appending an OpenAI API version', async () => {
    const provider = createProvider({
      defaultChatEndpoint: ENDPOINT_TYPE.OLLAMA_CHAT,
      endpointConfigs: {
        [ENDPOINT_TYPE.OLLAMA_CHAT]: {
          adapterFamily: 'ollama',
          baseUrl: 'http://127.0.0.1:11434',
        },
      },
      id: 'ollama',
      presetProviderId: 'ollama',
    });
    const runtime = createRuntime({
      apiKeySelection: { attribution: 'unknown' },
      value: 'ollama-secret',
    });

    const resolved = await resolveProviderAiSdkConfig(
      provider,
      createModel(provider.id, 'qwen3:32b'),
      runtime,
    );

    expect(resolved.config).toMatchObject({
      providerId: 'ollama',
      providerSettings: {
        baseURL: 'http://127.0.0.1:11434/api',
        headers: { Authorization: 'Bearer ollama-secret' },
      },
    });
  });

  it('uses the native Ollama builder for a custom provider selected by endpoint', async () => {
    const provider = createProvider({
      defaultChatEndpoint: ENDPOINT_TYPE.OLLAMA_CHAT,
      endpointConfigs: {
        [ENDPOINT_TYPE.OLLAMA_CHAT]: {
          adapterFamily: 'ollama',
          baseUrl: 'http://192.168.1.20:11434',
        },
      },
      id: 'local-ollama',
      presetProviderId: undefined,
    });

    const resolved = await resolveProviderAiSdkConfig(
      provider,
      createModel(provider.id, 'qwen3:32b'),
      createRuntime(),
    );

    expect(resolved.config).toMatchObject({
      providerId: 'ollama',
      providerSettings: { baseURL: 'http://192.168.1.20:11434/api' },
    });
  });

  it('builds Bedrock IAM config and records the auth receipt', async () => {
    const provider = createProvider({
      authType: 'iam-aws',
      defaultChatEndpoint: ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
      endpointConfigs: {
        [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: { adapterFamily: 'bedrock' },
      },
      id: 'aws-bedrock',
      presetProviderId: 'aws-bedrock',
    });
    const runtime = createRuntime(undefined, {
      accessKeyId: 'AKIA',
      region: 'us-east-1',
      secretAccessKey: 'secret',
      type: 'iam-aws',
    });

    const resolved = await resolveProviderAiSdkConfig(
      provider,
      createModel(provider.id, 'anthropic.claude-haiku-4-5-v1:0'),
      runtime,
    );

    expect(resolved).toMatchObject({
      config: {
        providerId: 'bedrock',
        providerSettings: {
          accessKeyId: 'AKIA',
          baseURL: undefined,
          region: 'us-east-1',
          secretAccessKey: 'secret',
        },
      },
      credentialReceipt: { attribution: 'auth', method: 'iam-aws' },
    });
    expect(runtime.resolveApiKey).not.toHaveBeenCalled();
  });

  it.each([
    [
      ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
      'google-vertex',
      'gemini-2.5-flash',
      'https://us-central1-aiplatform.googleapis.com/v1/publishers/google',
    ],
    [
      ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
      'google-vertex-anthropic',
      'claude-haiku-4-5@20251001',
      'https://us-central1-aiplatform.googleapis.com/v1/publishers/anthropic/models',
    ],
  ])(
    'builds %s through %s with normalized service-account credentials',
    async (endpointType, adapterFamily, apiModelId, baseURL) => {
      const provider = createProvider({
        authType: 'iam-gcp',
        defaultChatEndpoint: endpointType,
        endpointConfigs: {
          [endpointType]: {
            adapterFamily,
            baseUrl: 'https://us-central1-aiplatform.googleapis.com/v1',
          },
        },
        id: 'vertexai',
        presetProviderId: 'vertexai',
      });
      const runtime = createRuntime(undefined, createVertexAuthConfig());
      const model = {
        ...createModel(provider.id, apiModelId),
        apiModelId,
        endpointTypes: [endpointType],
      };

      const resolved = await resolveProviderAiSdkConfig(provider, model, runtime);

      expect(resolved).toMatchObject({
        config: {
          providerId: adapterFamily,
          providerSettings: {
            baseURL,
            googleCredentials: { clientEmail: 'svc@example.com' },
            location: 'us-central1',
            project: 'project-id',
          },
        },
        credentialReceipt: { attribution: 'auth', method: 'iam-gcp' },
      });
      expect(runtime.resolveApiKey).not.toHaveBeenCalled();
    },
  );

  it('routes Vertex MaaS model ids through the dedicated OpenAI-compatible adapter', async () => {
    const provider = createProvider({
      authType: 'iam-gcp',
      defaultChatEndpoint: ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
      endpointConfigs: {
        [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT]: { adapterFamily: 'google-vertex' },
      },
      id: 'vertexai',
      presetProviderId: 'vertexai',
    });
    const runtime = createRuntime(undefined, createVertexAuthConfig());
    const model = {
      ...createModel(provider.id, 'zai-org/glm-5-maas'),
      apiModelId: 'zai-org/glm-5-maas',
    };

    const resolved = await resolveProviderAiSdkConfig(provider, model, runtime);

    expect(resolved.config).toMatchObject({
      providerId: 'google-vertex-maas',
      providerSettings: {
        location: 'us-central1',
        project: 'project-id',
      },
    });
    expect(resolved.config.providerSettings.baseURL).toBeUndefined();
  });

  it('passes every configured AiHubMix endpoint base URL to its routed factory', async () => {
    const provider = createProvider({
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      endpointConfigs: {
        [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: {
          adapterFamily: 'aihubmix',
          baseUrl: 'https://proxy.example.com/anthropic/v1',
        },
        [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT]: {
          adapterFamily: 'aihubmix',
          baseUrl: 'https://proxy.example.com/gemini/v1beta',
        },
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
          adapterFamily: 'aihubmix',
          baseUrl: 'https://proxy.example.com/chat/v1',
        },
        [ENDPOINT_TYPE.OPENAI_RESPONSES]: {
          adapterFamily: 'aihubmix',
          baseUrl: 'https://proxy.example.com/responses/v1',
        },
      },
      id: 'aihubmix',
      presetProviderId: 'aihubmix',
    });

    const config = await providerToAiSdkConfig(
      provider,
      createModel(provider.id, 'gpt-5.4'),
      createRuntime(),
    );

    expect((config.providerSettings as Record<string, unknown>).endpointBaseURLs).toEqual({
      [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: 'https://proxy.example.com/anthropic/v1',
      [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT]: 'https://proxy.example.com/gemini/v1beta',
      [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: 'https://proxy.example.com/chat/v1',
      [ENDPOINT_TYPE.OPENAI_RESPONSES]: 'https://proxy.example.com/responses/v1',
    });
  });

  it('passes every configured DMXAPI endpoint base URL to its routed factory', async () => {
    const provider = createProvider({
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      endpointConfigs: {
        [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: {
          adapterFamily: 'dmxapi',
          baseUrl: 'https://proxy.example.com/anthropic/v1',
        },
        [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT]: {
          adapterFamily: 'dmxapi',
          baseUrl: 'https://proxy.example.com/gemini/v1beta',
        },
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
          adapterFamily: 'dmxapi',
          baseUrl: 'https://proxy.example.com/chat/v1',
        },
      },
      id: 'dmxapi',
      presetProviderId: 'dmxapi',
    });

    const config = await providerToAiSdkConfig(
      provider,
      createModel(provider.id, 'gemini-2.5-pro'),
      createRuntime({ value: 'sk-test', apiKeySelection: { attribution: 'unknown' } }),
    );

    expect(config.providerId).toBe('dmxapi');
    expect((config.providerSettings as Record<string, unknown>).endpointBaseURLs).toEqual({
      [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: 'https://proxy.example.com/anthropic/v1',
      [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT]: 'https://proxy.example.com/gemini/v1beta',
      [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: 'https://proxy.example.com/chat/v1',
    });
  });
});

function createRuntime(
  resolved: ResolvedProviderApiKey = {
    value: '',
    apiKeySelection: { attribution: 'unknown' },
  },
  authConfig: AuthConfig | null = null,
) {
  return {
    getAuthConfig: jest.fn(async () => authConfig),
    resolveApiKey: jest.fn(async () => resolved),
  };
}

function createVertexAuthConfig(): AuthConfig {
  return {
    credentials: {
      client_email: 'svc@example.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nMIIabc\n-----END PRIVATE KEY-----',
    },
    location: 'us-central1',
    project: 'project-id',
    type: 'iam-gcp',
  };
}

function createProvider(overrides: Partial<Provider>): Provider {
  return {
    apiFeatures: {
      arrayContent: true,
      serviceTier: true,
      streamOptions: true,
      verbosity: false,
      reportsActualCost: false,
    },
    apiKeys: [],
    authType: 'api-key',
    endpointConfigs: {},
    id: 'provider',
    isEnabled: true,
    name: 'Provider',
    settings: {},
    ...overrides,
  };
}

function createModel(providerId: string, modelId: string): Model {
  return {
    capabilities: [],
    id: createUniqueModelId(providerId, modelId),
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    modelId,
    name: modelId,
    providerId,
    supportsStreaming: true,
  };
}
