import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';

import type { Provider } from '@/shared/data/types/provider';

import { listModels } from '../listModels';

describe('listModels adapter', () => {
  it('requests /models at a versionless custom base URL without a URL fragment', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const provider = createProvider();
    provider.id = 'custom';
    provider.presetProviderId = undefined;
    provider.endpointConfigs = {
      [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl: 'https://api.example.com/gateway#' },
    };
    await listModels(provider, { getRotatedApiKey: () => 'test-key' }, undefined, {
      throwOnError: true,
    });
    const [input] = fetchMock.mock.calls[0];
    expect(input instanceof Request ? input.url : String(input)).toBe(
      'https://api.example.com/gateway/models',
    );
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('adds mobile app headers to portable model-list requests', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));

    await listModels(createProvider(), {
      getRotatedApiKey: jest.fn(async () => 'test-key'),
    });

    const [input, init] = fetchMock.mock.calls[0];
    const headers = input instanceof Request ? input.headers : new Headers(init?.headers);
    expect(headers.get('User-Agent')).toMatch(/^CherryStudioMobile\/1\.0(?: |$)/);
    expect(headers.get('X-App-Name')).toBe('CherryStudioMobile');
  });
});

function createProvider(): Provider {
  return {
    apiFeatures: {
      arrayContent: true,
      reportsActualCost: false,
      serviceTier: true,
      streamOptions: true,
      verbosity: false,
    },
    apiKeys: [],
    authType: 'api-key',
    defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    endpointConfigs: {
      [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl: 'https://api.example.com/v1' },
    },
    id: 'openai',
    isEnabled: true,
    name: 'OpenAI',
    presetProviderId: 'openai',
    settings: {},
  };
}
