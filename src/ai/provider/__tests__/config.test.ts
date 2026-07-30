import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { ResolvedProviderApiKey } from '@/data/services/ProviderService';
import { createUniqueModelId, type Model } from '@/data/types/model';
import type { Provider } from '@/data/types/provider';

import { providerToAiSdkConfig, resolveProviderAiSdkConfig } from '../config';

jest.mock('@/integration/cherryAi', () => ({
  generateSignature: jest.fn(() => ({
    'X-Client-ID': 'cherry-studio',
    'X-Timestamp': '1700000000',
    'X-Signature': 'signed',
  })),
}));

const { generateSignature } = jest.requireMock('@/integration/cherryAi') as {
  generateSignature: jest.Mock;
};

describe('providerToAiSdkConfig', () => {
  beforeEach(() => {
    generateSignature.mockClear();
  });

  it('adds CherryAI signing fetch for OpenAI-compatible chat completions', async () => {
    const provider = createProvider({
      id: 'cherryai',
      presetProviderId: 'cherryai',
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
          baseUrl: 'https://api.cherry-ai.com',
        },
      },
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    });
    const model = createModel(provider.id, 'glm-4.5-flash');

    const config = await providerToAiSdkConfig(provider, model, createRuntime());

    expect(config.providerId).toBe('openai-compatible');
    expect(config.providerSettings).toMatchObject({
      baseURL: 'https://api.cherry-ai.com',
      name: 'cherryai',
    });
    expect(typeof config.providerSettings.fetch).toBe('function');

    const fetchMock = jest.fn(async () => new Response(null, { status: 204 }));
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

    await config.providerSettings.fetch?.('https://api.cherry-ai.com/chat/completions', {
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], model: model.modelId }),
      headers: { Existing: 'header' },
      method: 'POST',
    });

    expect(generateSignature).toHaveBeenCalledWith({
      body: { messages: [{ role: 'user', content: 'hi' }], model: model.modelId },
      method: 'POST',
      path: '/chat/completions',
      query: '',
    });
    expect(fetchMock).toHaveBeenCalledWith('https://api.cherry-ai.com/chat/completions', {
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], model: model.modelId }),
      headers: {
        Existing: 'header',
        'X-Client-ID': 'cherry-studio',
        'X-Timestamp': '1700000000',
        'X-Signature': 'signed',
      },
      method: 'POST',
    });
  });

  it('does not add CherryAI fetch to generic OpenAI-compatible providers', async () => {
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
});

function createRuntime(
  resolved: ResolvedProviderApiKey = {
    value: '',
    apiKeySelection: { attribution: 'unknown' },
  },
) {
  return {
    getAuthConfig: jest.fn(async () => null),
    resolveApiKey: jest.fn(async () => resolved),
  };
}

function createProvider(overrides: Partial<Provider>): Provider {
  return {
    apiFeatures: {
      arrayContent: true,
      developerRole: true,
      serviceTier: true,
      streamOptions: true,
      verbosity: false,
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
