import { ENDPOINT_TYPE, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import type { Provider } from '@cherrystudio/universal/data/types/provider';

import { listModels } from '../listModels';

describe('listModels', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test('keeps CherryIN owned_by separate from desktop default group', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'anthropic/claude-sonnet-4-5',
              object: 'model',
              owned_by: 'custom',
            },
          ],
          object: 'list',
        }),
        { status: 200 },
      ),
    );

    const models = await listModels(createProvider(), {
      getRotatedApiKey: jest.fn(async () => 'test-key'),
    });

    expect(models).toEqual([
      expect.objectContaining({
        apiModelId: 'anthropic/claude-sonnet-4-5',
        group: 'anthropic',
        id: 'cherryin::anthropic/claude-sonnet-4-5',
        modelId: 'anthropic/claude-sonnet-4-5',
        ownedBy: 'custom',
        providerId: 'cherryin',
      }),
    ]);
  });

  test('keeps Together organization separate from desktop default group', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 'meta-llama/Llama-3.1-8B-Instruct-Turbo',
            display_name: 'Llama 3.1 8B',
            organization: 'Meta',
          },
        ]),
        { status: 200 },
      ),
    );

    const models = await listModels(createProvider({ id: 'together' }), {
      getRotatedApiKey: jest.fn(async () => 'test-key'),
    });

    expect(models).toEqual([
      expect.objectContaining({
        apiModelId: 'meta-llama/Llama-3.1-8B-Instruct-Turbo',
        group: 'meta-llama',
        modelId: 'meta-llama/Llama-3.1-8B-Instruct-Turbo',
        ownedBy: 'Meta',
        providerId: 'together',
      }),
    ]);
  });

  test('keeps AI Gateway provider owner separate from desktop default group', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [
            {
              id: 'openai/gpt-4o',
              name: 'GPT-4o',
              specification: { provider: 'OpenAI' },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const models = await listModels(createProvider({ id: 'gateway' }), {
      getRotatedApiKey: jest.fn(async () => 'test-key'),
    });

    expect(models).toEqual([
      expect.objectContaining({
        apiModelId: 'openai/gpt-4o',
        group: 'openai',
        modelId: 'openai/gpt-4o',
        ownedBy: 'OpenAI',
        providerId: 'gateway',
      }),
    ]);
  });

  test('marks OpenRouter image models and survives a missing image endpoint', async () => {
    const responseByUrl: Record<string, unknown> = {
      'https://openrouter.ai/api/v1/models': { data: [{ id: 'openai/gpt-4o' }] },
      'https://openrouter.ai/api/v1/embeddings/models': { data: [{ id: 'openai/text-embed' }] },
      'https://openrouter.ai/api/v1/images/models': {
        data: [{ id: 'google/nano-banana', name: 'Nano Banana' }],
      },
    };
    let imageEndpointAvailable = true;
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('/images/models') && !imageEndpointAvailable) {
        return new Response('not found', { status: 404 });
      }
      return new Response(JSON.stringify(responseByUrl[url]), { status: 200 });
    });
    const context = { getRotatedApiKey: jest.fn(async () => 'test-key') };

    const models = await listModels(createProvider({ id: 'openrouter' }), context);

    expect(
      models.map((model) => ({
        apiModelId: model.apiModelId,
        capabilities: model.capabilities,
        endpointTypes: model.endpointTypes,
        name: model.name,
      })),
    ).toEqual([
      {
        apiModelId: 'openai/gpt-4o',
        capabilities: [],
        endpointTypes: undefined,
        name: 'openai/gpt-4o',
      },
      {
        apiModelId: 'openai/text-embed',
        capabilities: [],
        endpointTypes: undefined,
        name: 'openai/text-embed',
      },
      {
        apiModelId: 'google/nano-banana',
        capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
        endpointTypes: [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION],
        name: 'Nano Banana',
      },
    ]);

    // The image catalog is optional: a deployment without it still lists chat models,
    // even when the caller asked for failures to be thrown.
    imageEndpointAvailable = false;
    const withoutImages = await listModels(
      createProvider({ id: 'openrouter' }),
      context,
      undefined,
      {
        throwOnError: true,
      },
    );

    expect(withoutImages.map((model) => model.apiModelId)).toEqual([
      'openai/gpt-4o',
      'openai/text-embed',
    ]);
  });

  test('maps NewAPI supported_endpoint_types to endpointTypes and an implied capability', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: 'gpt-image-1', supported_endpoint_types: ['image-generation', 'image-edit'] },
            { id: 'text-embedding-3', supported_endpoint_types: ['EMBEDDINGS'] },
            { id: 'claude-sonnet', supported_endpoint_types: ['anthropic', 'anthropic'] },
            { id: 'mystery-model', supported_endpoint_types: ['not-a-known-endpoint'] },
            { id: 'plain-model' },
          ],
          object: 'list',
        }),
        { status: 200 },
      ),
    );

    const models = await listModels(createProvider(), {
      getRotatedApiKey: jest.fn(async () => 'test-key'),
    });

    expect(
      models.map((model) => ({
        apiModelId: model.apiModelId,
        capabilities: model.capabilities,
        endpointTypes: model.endpointTypes,
      })),
    ).toEqual([
      {
        apiModelId: 'gpt-image-1',
        capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
        endpointTypes: [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION, ENDPOINT_TYPE.OPENAI_IMAGE_EDIT],
      },
      {
        apiModelId: 'text-embedding-3',
        capabilities: [MODEL_CAPABILITY.EMBEDDING],
        endpointTypes: [ENDPOINT_TYPE.OPENAI_EMBEDDINGS],
      },
      // Duplicates collapse, and a chat endpoint implies no extra capability.
      {
        apiModelId: 'claude-sonnet',
        capabilities: [],
        endpointTypes: [ENDPOINT_TYPE.ANTHROPIC_MESSAGES],
      },
      // Unknown values drop out entirely rather than being persisted as-is.
      { apiModelId: 'mystery-model', capabilities: [], endpointTypes: undefined },
      { apiModelId: 'plain-model', capabilities: [], endpointTypes: undefined },
    ]);
  });

  test('drops non-chat models from the OpenAI preset only', async () => {
    const data = [
      { id: 'gpt-4o', object: 'model' },
      { id: 'whisper-1', object: 'model' },
      { id: 'gpt-4o-audio-preview', object: 'model' },
      { id: 'tts-1', object: 'model' },
      { id: 'sora-2', object: 'model' },
    ];
    // A Response body can only be read once, so each call needs its own.
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () => new Response(JSON.stringify({ data, object: 'list' }), { status: 200 }),
      );
    const context = { getRotatedApiKey: jest.fn(async () => 'test-key') };

    const openAiModels = await listModels(createProvider({ id: 'openai' }), context);
    // A third-party OpenAI-compatible endpoint may legitimately serve one of these ids.
    const compatibleModels = await listModels(createProvider({ id: 'some-proxy' }), context);

    expect(openAiModels.map((model) => model.apiModelId)).toEqual(['gpt-4o']);
    expect(compatibleModels.map((model) => model.apiModelId)).toEqual(data.map((item) => item.id));
  });

  test('drops Gemini models that cannot serve generateContent', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [
            { name: 'models/gemini-3-pro', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/veo-3', supportedGenerationMethods: ['predictLongRunning'] },
            {
              name: 'models/gemini-live-2.5',
              supportedGenerationMethods: ['bidiGenerateContent'],
            },
            {
              name: 'models/gemini-2.5-flash-tts',
              supportedGenerationMethods: ['generateContent'],
            },
            { name: 'models/gemini-legacy' },
          ],
        }),
        { status: 200 },
      ),
    );

    const models = await listModels(createProvider({ id: 'gemini' }), {
      getRotatedApiKey: jest.fn(async () => 'test-key'),
    });

    expect(models.map((model) => model.apiModelId)).toEqual(['gemini-3-pro', 'gemini-legacy']);
  });

  test('adds X-Source to Radeon model listing without adding it to other providers', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      Promise.resolve(
        new Response(JSON.stringify({ data: [] }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }),
      ),
    );
    const context = { getRotatedApiKey: jest.fn(async () => 'test-key') };

    await listModels(
      createProvider({
        endpointConfigs: {
          [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
            baseUrl: 'https://developer.amd.com.cn/radeon/v1',
          },
        },
        id: 'radeon-cloud',
      }),
      context,
    );
    await listModels(
      createProvider({
        endpointConfigs: {
          [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl: 'https://api.example.com/v1' },
        },
        id: 'other-openai-compatible',
      }),
      context,
    );

    expect(requestUrl(fetchMock.mock.calls[0])).toBe(
      'https://developer.amd.com.cn/radeon/v1/models',
    );
    expect(requestHeaders(fetchMock.mock.calls[0]).get('X-Source')).toBe('cherry-studio');
    expect(requestHeaders(fetchMock.mock.calls[1]).has('X-Source')).toBe(false);
  });
});

function requestUrl(call: Parameters<typeof fetch>): string {
  const [input] = call;
  return input instanceof Request ? input.url : String(input);
}

function requestHeaders(call: Parameters<typeof fetch>): Headers {
  const [input, init] = call;
  return input instanceof Request ? input.headers : new Headers(init?.headers);
}

function createProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    apiFeatures: {
      arrayContent: true,
      developerRole: true,
      serviceTier: true,
      streamOptions: true,
      verbosity: false,
      reportsActualCost: false,
    },
    apiKeys: [],
    authType: 'api-key',
    defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    endpointConfigs: {
      [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
        baseUrl: 'https://api.cherry-ai.com',
      },
    },
    id: 'cherryin',
    isEnabled: true,
    name: 'CherryIN',
    settings: {},
    ...overrides,
  };
}
