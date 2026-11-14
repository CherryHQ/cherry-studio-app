import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';

import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import { DEFAULT_API_FEATURES, type Provider } from '@/shared/data/types/provider';

import { resolveProviderConnection, resolveProviderServiceUrl } from '../providerConnection';

describe('resolveProviderConnection', () => {
  it('resolves shared endpoint, adapter, wire model, and request header facts', () => {
    const provider = createProvider();
    const model = createModel();

    expect(resolveProviderConnection(provider, model)).toEqual({
      adapterFamily: 'google',
      baseUrl: 'https://generativelanguage.googleapis.com',
      endpointType: ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
      headers: {
        Authorization: 'Bearer header-secret',
        'User-Agent': 'CherryStudioMobile/1.0',
        'X-App-Name': 'CherryStudioMobile',
        'X-Custom': 'custom',
      },
      wireModelId: 'gemini-2.5-flash',
    });
  });

  it('does not expose runtime API key metadata', () => {
    const provider = createProvider();
    provider.apiKeys = [{ id: 'key-1', isEnabled: true, label: 'primary' }];

    const serialized = JSON.stringify(resolveProviderConnection(provider, createModel()));

    expect(serialized).not.toContain('key-1');
    expect(serialized).not.toContain('apiKeys');
  });

  it('routes two models on one provider through independent endpoint URLs', () => {
    const provider = createProvider();
    provider.endpointConfigs = {
      [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: {
        adapterFamily: 'anthropic',
        baseUrl: 'https://anthropic.example.com',
      },
      [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
        adapterFamily: 'openai-compatible',
        baseUrl: 'https://openai.example.com/v1',
      },
    };
    const anthropicModel = {
      ...createModel(),
      endpointTypes: [ENDPOINT_TYPE.ANTHROPIC_MESSAGES],
    };
    const openAiModel = {
      ...createModel(),
      endpointTypes: [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS],
    };

    expect(resolveProviderConnection(provider, anthropicModel)).toMatchObject({
      adapterFamily: 'anthropic',
      baseUrl: 'https://anthropic.example.com',
      endpointType: ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
    });
    expect(resolveProviderConnection(provider, openAiModel)).toMatchObject({
      adapterFamily: 'openai-compatible',
      baseUrl: 'https://openai.example.com/v1',
      endpointType: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    });
  });
});

describe('resolveProviderServiceUrl', () => {
  it('rejects a Vertex override that names a different project', () => {
    expect(() =>
      resolveProviderServiceUrl(
        'https://aiplatform.googleapis.com/v1/projects/other/locations/global',
        {
          type: 'iam-gcp',
          project: 'project-id',
          location: 'global',
        },
      ),
    ).toThrow();
  });

  it('keeps ordinary connection URLs unchanged', () => {
    expect(resolveProviderServiceUrl('https://provider.example/gateway/v1', null)).toBe(
      'https://provider.example/gateway/v1',
    );
  });

  it.each([
    ['', 'global', 'https://aiplatform.googleapis.com'],
    ['', 'us-central1', 'https://us-central1-aiplatform.googleapis.com'],
    [
      'https://aiplatform.googleapis.com/v1',
      'us-central1',
      'https://us-central1-aiplatform.googleapis.com',
    ],
    ['https://gateway.example/vertex/v1', 'us-central1', 'https://gateway.example/vertex'],
  ])(
    'derives the Vertex service URL for %s in %s without credentials',
    (baseUrl, location, expected) => {
      expect(
        resolveProviderServiceUrl(baseUrl, {
          type: 'iam-gcp',
          project: 'project-id',
          location,
        }),
      ).toBe(expected);
    },
  );
});

function createProvider(): Provider {
  return {
    apiFeatures: { ...DEFAULT_API_FEATURES },
    apiKeys: [],
    authMethods: ['api-key'],
    authType: 'api-key',
    defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    endpointConfigs: {
      [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT]: {
        adapterFamily: 'google',
        baseUrl: 'https://generativelanguage.googleapis.com',
      },
      [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
        adapterFamily: 'openai-compatible',
        baseUrl: 'https://openai-compatible.example.com/v1',
      },
    },
    id: 'test-provider',
    isEnabled: true,
    name: 'Test Provider',
    settings: {
      extraHeaders: {
        Authorization: 'Bearer header-secret',
        'X-Custom': 'custom',
      },
    },
  };
}

function createModel(): Model {
  return {
    apiModelId: 'models/gemini-2.5-flash',
    capabilities: [],
    endpointTypes: [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT],
    id: createUniqueModelId('test-provider', 'gemini-2.5-flash'),
    isEnabled: true,
    isHidden: false,
    modelId: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    providerId: 'test-provider',
    supportsStreaming: true,
  };
}
