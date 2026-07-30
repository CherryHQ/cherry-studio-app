import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { providerToAiSdkConfig } from '../config';

jest.mock('@/services/cherryin/signature', () => ({
  generateSignature: jest.fn(() => ({
    'X-Client-ID': 'cherry-studio',
    'X-Timestamp': '1700000000',
    'X-Signature': 'signed',
  })),
}));

const { generateSignature } = jest.requireMock('@/services/cherryin/signature') as {
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
});

function createRuntime() {
  return {
    getAuthConfig: jest.fn(async () => null),
    getRotatedApiKey: jest.fn(async () => ''),
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
