import { embedMany as aiCoreEmbedMany } from '@cherrystudio/ai-core';
import { ENDPOINT_TYPE, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import { AiService, type AiServiceDependencies } from '@/ai/AiService';
import { type Assistant, DEFAULT_ASSISTANT_SETTINGS } from '@/data/types/assistant';
import { createUniqueModelId, type Model, type UniqueModelId } from '@/data/types/model';
import type { Provider } from '@/data/types/provider';

const mockGenerate = jest.fn(async () => ({ text: 'ok', usage: undefined }));
const mockStream = jest.fn(
  () =>
    new ReadableStream({
      start(controller) {
        controller.close();
      },
    }),
);
const mockAgentConstructor = jest.fn();

jest.mock('@cherrystudio/ai-core', () => ({
  embedMany: jest.fn(async () => ({ embeddings: [[0.1]], usage: undefined })),
  generateImage: jest.fn(),
  definePlugin: jest.fn((plugin) => plugin),
}));

jest.mock('@/integration/cherryAi', () => ({
  generateSignature: jest.fn(() => ({})),
}));

jest.mock('@/ai/runtime/aiSdk/Agent', () => ({
  Agent: jest.fn().mockImplementation((params) => {
    mockAgentConstructor(params);
    return { generate: mockGenerate, stream: mockStream };
  }),
}));

const embedManyMock = aiCoreEmbedMany as jest.MockedFunction<typeof aiCoreEmbedMany>;

describe('AiService.checkModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('checks embedding models with embedMany', async () => {
    const model = createModel('text-embedding-3-small', {
      capabilities: [MODEL_CAPABILITY.EMBEDDING],
      endpointTypes: [ENDPOINT_TYPE.OPENAI_EMBEDDINGS],
    });
    const services = createServices({ model });
    const service = new AiService(services);
    const externalController = new AbortController();

    await service.checkModel({
      apiKeyOverride: 'selected-key',
      requestOptions: {
        headers: { 'X-Check': 'yes', 'X-Empty': undefined },
        maxRetries: 3,
        signal: externalController.signal,
      },
      timeout: 1000,
      uniqueModelId: model.id,
    });

    expect(embedManyMock).toHaveBeenCalledTimes(1);
    expect(embedManyMock).toHaveBeenCalledWith(
      'openai-compatible',
      expect.objectContaining({
        apiKey: 'selected-key',
        baseURL: 'https://api.example.com/v1',
      }),
      expect.objectContaining({
        abortSignal: expect.any(AbortSignal),
        headers: { 'X-Check': 'yes' },
        maxRetries: 3,
        model: model.modelId,
        values: ['test'],
      }),
    );
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(services.provider.getRotatedApiKey).not.toHaveBeenCalled();
  });

  it('keeps provider options when checking embedding models through an assistant', async () => {
    const model = createModel('text-embedding-3-small', {
      capabilities: [MODEL_CAPABILITY.EMBEDDING],
      endpointTypes: [ENDPOINT_TYPE.OPENAI_EMBEDDINGS],
    });
    const assistant = createAssistant(model.id);
    const service = new AiService(createServices({ assistant, model }));

    await service.checkModel({
      assistantId: assistant.id,
      requestOptions: { maxRetries: 1 },
      timeout: 1000,
    });

    expect(embedManyMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      expect.objectContaining({
        maxRetries: 1,
        providerOptions: {
          'openai-compatible': {
            customFlag: true,
            reasoningEffort: 'low',
          },
        },
      }),
    );
  });

  it('checks non-embedding models with generateText probe', async () => {
    const model = createModel('gpt-4o-mini');
    const service = new AiService(createServices({ model }));

    await service.checkModel({
      requestOptions: { maxRetries: 2 },
      timeout: 1000,
      uniqueModelId: model.id,
    });

    expect(embedManyMock).not.toHaveBeenCalled();
    expect(mockAgentConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: model.modelId,
        system: 'test',
      }),
    );
    expect(mockGenerate).toHaveBeenCalledWith({ prompt: 'hi' }, expect.any(AbortSignal));
  });

  it('uses the runtime default model for assistant-less requests', async () => {
    const defaultModel = createModel('gpt-4o');
    const service = new AiService(
      createServices({
        defaultModelId: defaultModel.id,
        model: defaultModel,
      }),
    );

    await service.checkModel({
      requestOptions: { maxRetries: 1 },
      timeout: 1000,
    });

    expect(mockAgentConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: defaultModel.modelId,
      }),
    );
  });

  it('fails assistant-less requests when no default model is configured', async () => {
    const model = createModel('gpt-4o');
    const service = new AiService(createServices({ defaultModelId: null, model }));

    await expect(
      service.checkModel({
        timeout: 1000,
      }),
    ).rejects.toThrow('No default model configured for assistant-less topic');
  });

  it('does not fall back to the runtime default model when a persisted assistant has no model', async () => {
    const defaultModel = createModel('gpt-4o');
    const assistant = createAssistant(null);
    const service = new AiService(
      createServices({
        assistant,
        defaultModelId: defaultModel.id,
        model: defaultModel,
      }),
    );

    await expect(
      service.checkModel({
        assistantId: assistant.id,
        timeout: 1000,
      }),
    ).rejects.toThrow(`Assistant ${assistant.id} has no model configured`);
  });

  it('prefers explicit uniqueModelId over assistant and runtime default models', async () => {
    const explicitModel = createModel('gpt-4o');
    const assistantModel = createModel('claude-sonnet');
    const defaultModel = createModel('gemini-pro');
    const assistant = createAssistant(assistantModel.id);
    const service = new AiService(
      createServices({
        assistant,
        defaultModelId: defaultModel.id,
        models: [explicitModel, assistantModel, defaultModel],
      }),
    );

    await service.checkModel({
      assistantId: assistant.id,
      timeout: 1000,
      uniqueModelId: explicitModel.id,
    });

    expect(mockAgentConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: explicitModel.modelId,
      }),
    );
  });
});

describe('AiService web search plugin wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('wires a provider-builtin web-search plugin into the agent when enabled', async () => {
    const model = createModel('gpt-4o-mini', { capabilities: [MODEL_CAPABILITY.WEB_SEARCH] });
    const assistant = createAssistant(model.id);
    assistant.settings.enableWebSearch = true;
    const services = createServices({
      assistant,
      model,
      webSearchPreferences: {
        'chat.web_search.max_results': 42,
        'chat.web_search.exclude_domains': ['blocked.com'],
      },
    });
    const service = new AiService(services);

    await service.checkModel({ assistantId: assistant.id, timeout: 1000 });

    expect(mockAgentConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        plugins: expect.arrayContaining([expect.objectContaining({ name: 'webSearch' })]),
      }),
    );
  });

  it('does not wire a web-search plugin when the assistant has web search disabled', async () => {
    const model = createModel('gpt-4o-mini', { capabilities: [MODEL_CAPABILITY.WEB_SEARCH] });
    const assistant = createAssistant(model.id);
    const services = createServices({ assistant, model });
    const service = new AiService(services);

    await service.checkModel({ assistantId: assistant.id, timeout: 1000 });

    expect(mockAgentConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        plugins: expect.not.arrayContaining([expect.objectContaining({ name: 'webSearch' })]),
      }),
    );
  });

  it('does not wire a web-search plugin when the model lacks web-search capability', async () => {
    const model = createModel('gpt-4o-mini');
    const assistant = createAssistant(model.id);
    assistant.settings.enableWebSearch = true;
    const services = createServices({ assistant, model });
    const service = new AiService(services);

    await service.checkModel({ assistantId: assistant.id, timeout: 1000 });

    expect(mockAgentConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        plugins: expect.not.arrayContaining([expect.objectContaining({ name: 'webSearch' })]),
      }),
    );
  });

  it('exposes configured external web search as a bounded agent tool', async () => {
    const model = createModel('gpt-4o-mini', {
      capabilities: [MODEL_CAPABILITY.FUNCTION_CALL, MODEL_CAPABILITY.WEB_SEARCH],
    });
    const assistant = createAssistant(model.id);
    assistant.settings.enableWebSearch = true;
    assistant.settings.enableMaxToolCalls = true;
    assistant.settings.maxToolCalls = 3;
    const services = createServices({ assistant, model, webSearchProviderId: 'tavily' });
    const service = new AiService(services);
    const controller = new AbortController();

    await service.streamText({
      assistantId: assistant.id,
      chatId: 'topic-1',
      messages: [],
      requestOptions: { signal: controller.signal },
      trigger: 'submit-message',
    });

    const params = mockAgentConstructor.mock.calls.at(-1)?.[0];
    expect(params).toEqual(
      expect.objectContaining({
        options: expect.objectContaining({ stopWhen: expect.any(Function) }),
        plugins: expect.not.arrayContaining([expect.objectContaining({ name: 'webSearch' })]),
        tools: expect.objectContaining({ web_search: expect.any(Object) }),
      }),
    );
    expect(params.options.stopWhen({ steps: Array.from({ length: 2 }, () => ({})) })).toBe(false);
    expect(params.options.stopWhen({ steps: Array.from({ length: 3 }, () => ({})) })).toBe(true);

    const result = await params.tools.web_search.execute(
      { query: 'Cherry Studio mobile' },
      { abortSignal: controller.signal },
    );

    expect(services.webSearch.searchKeywords).toHaveBeenCalledWith(
      { keywords: ['Cherry Studio mobile'] },
      { signal: controller.signal },
    );
    expect(result).toEqual([
      {
        content: 'Mobile result',
        id: 1,
        title: 'Cherry Studio',
        url: 'https://example.com/cherry',
      },
    ]);
  });

  it('uses provider-native web search alone when no external provider is configured', async () => {
    const model = createModel('gpt-4o-mini', {
      capabilities: [MODEL_CAPABILITY.FUNCTION_CALL, MODEL_CAPABILITY.WEB_SEARCH],
    });
    const assistant = createAssistant(model.id);
    assistant.settings.enableWebSearch = true;
    const service = new AiService(createServices({ assistant, model }));

    await service.streamText({
      assistantId: assistant.id,
      chatId: 'topic-1',
      messages: [],
      requestOptions: { signal: new AbortController().signal },
      trigger: 'submit-message',
    });

    expect(mockAgentConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        plugins: expect.arrayContaining([expect.objectContaining({ name: 'webSearch' })]),
        tools: undefined,
      }),
    );
  });

  it('falls back to provider-native search when the model cannot call the external tool', async () => {
    const model = createModel('gpt-4o-mini', {
      capabilities: [MODEL_CAPABILITY.WEB_SEARCH],
    });
    const assistant = createAssistant(model.id);
    assistant.settings.enableWebSearch = true;
    const service = new AiService(
      createServices({ assistant, model, webSearchProviderId: 'tavily' }),
    );

    await service.streamText({
      assistantId: assistant.id,
      chatId: 'topic-1',
      messages: [],
      requestOptions: { signal: new AbortController().signal },
      trigger: 'submit-message',
    });

    expect(mockAgentConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        plugins: expect.arrayContaining([expect.objectContaining({ name: 'webSearch' })]),
        tools: undefined,
      }),
    );
  });
});

function createServices({
  assistant,
  defaultModelId,
  model,
  models,
  provider = createProvider(),
  webSearchProviderId = null,
  webSearchPreferences = {
    'chat.web_search.max_results': 5,
    'chat.web_search.exclude_domains': [],
  },
}: {
  assistant?: Assistant;
  defaultModelId?: UniqueModelId | null;
  model?: Model;
  models?: Model[];
  provider?: Provider;
  webSearchProviderId?: string | null;
  webSearchPreferences?: {
    'chat.web_search.max_results': number;
    'chat.web_search.exclude_domains': string[];
  };
}) {
  const modelList = models ?? (model ? [model] : []);
  const modelsById = new Map(modelList.map((item) => [item.id, item]));

  return {
    assistant: {
      getById: jest.fn(async () => assistant),
    },
    model: {
      getById: jest.fn(async (id: UniqueModelId) => modelsById.get(id)),
    },
    preference: {
      get: jest.fn(async (key: string) =>
        key === 'chat.default_model_id' ? (defaultModelId ?? null) : webSearchProviderId,
      ),
      getMultipleRawCached: jest.fn(() => webSearchPreferences),
    },
    provider: {
      getAuthConfig: jest.fn(async () => null),
      getByProviderId: jest.fn(async () => provider),
      getRotatedApiKey: jest.fn(async () => 'rotated-key'),
    },
    webSearch: {
      searchKeywords: jest.fn(async () => ({
        capability: 'searchKeywords',
        inputs: ['Cherry Studio mobile'],
        providerId: 'tavily',
        query: 'Cherry Studio mobile',
        results: [
          {
            content: 'Mobile result',
            sourceInput: 'Cherry Studio mobile',
            title: 'Cherry Studio',
            url: 'https://example.com/cherry',
          },
        ],
      })),
    },
  } as unknown as AiServiceDependencies;
}

function createProvider(overrides: Partial<Provider> = {}): Provider {
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
    endpointConfigs: {
      [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
        baseUrl: 'https://api.example.com',
      },
      [ENDPOINT_TYPE.OPENAI_EMBEDDINGS]: {
        baseUrl: 'https://api.example.com',
      },
    },
    id: 'test-provider',
    isEnabled: true,
    name: 'Test Provider',
    settings: {},
    ...overrides,
  };
}

function createModel(modelId: string, overrides: Partial<Model> = {}): Model {
  const providerId = overrides.providerId ?? 'test-provider';
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
    ...overrides,
  };
}

function createAssistant(modelId: Model['id'] | null): Assistant {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    description: '',
    emoji: '',
    id: '00000000-0000-4000-8000-000000000001',
    knowledgeBaseIds: [],
    mcpServerIds: [],
    modelId,
    modelName: null,
    name: 'Assistant',
    orderKey: 'a0',
    prompt: '',
    settings: {
      ...DEFAULT_ASSISTANT_SETTINGS,
      customParameters: [
        { name: 'customFlag', type: 'boolean', value: true },
        { name: 'reasoning_effort', type: 'string', value: 'low' },
      ],
    },
    tags: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}
