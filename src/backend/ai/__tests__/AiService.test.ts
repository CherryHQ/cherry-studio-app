import {
  embedMany as aiCoreEmbedMany,
  generateImage as aiCoreGenerateImage,
} from '@cherrystudio/ai-core';
import { ENDPOINT_TYPE, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import type { ToolSet } from 'ai';
import { AiService, type AiServiceDependencies } from '@/backend/ai/AiService';
import { createWebSearchTool } from '@/backend/ai/tools/adapters/aiSdk/builtin/WebSearchTool';
import { type Assistant, DEFAULT_ASSISTANT_SETTINGS } from '@/shared/data/types/assistant';
import { createUniqueModelId, type Model, type UniqueModelId } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

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

jest.mock('@/backend/ai/provider/cherryai', () => ({
  generateSignature: jest.fn(() => ({})),
}));

jest.mock('@/backend/ai/runtime/aiSdk/Agent', () => ({
  Agent: jest.fn().mockImplementation((params) => {
    mockAgentConstructor(params);
    return { generate: mockGenerate, stream: mockStream };
  }),
}));

const embedManyMock = aiCoreEmbedMany as jest.MockedFunction<typeof aiCoreEmbedMany>;
const generateImageMock = aiCoreGenerateImage as jest.MockedFunction<typeof aiCoreGenerateImage>;

describe('AiService.generateImage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    generateImageMock.mockResolvedValue({
      images: [{ base64: 'generated', mediaType: 'image/png' }],
      usage: undefined,
    } as never);
  });

  it('uses a string prompt and defaults to one image without attachments', async () => {
    const model = createModel('gpt-image-2', {
      capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
      endpointTypes: [ENDPOINT_TYPE.OPENAI_RESPONSES],
    });
    const service = new AiService(createServices({ model }));

    await service.generateImage({
      mode: 'generate',
      paramValues: {},
      prompt: 'draw a cherry',
      uniqueModelId: model.id,
    });

    expect(generateImageMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      expect.objectContaining({
        model: 'gpt-image-2',
        n: 1,
        prompt: 'draw a cherry',
      }),
    );
  });

  it('maps attachment data URLs to the AI SDK image prompt shape', async () => {
    const model = createModel('gpt-image-2', {
      capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
      endpointTypes: [ENDPOINT_TYPE.OPENAI_RESPONSES],
    });
    const service = new AiService(createServices({ model }));
    const inputImages = ['data:image/png;base64,a', 'data:image/jpeg;base64,b'];

    await service.generateImage({
      inputImages,
      mode: 'edit',
      paramValues: {},
      prompt: 'edit these images',
      uniqueModelId: model.id,
    });

    expect(generateImageMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ fetch: expect.any(Function) }),
      expect.objectContaining({
        n: 1,
        prompt: { images: inputImages, text: 'edit these images' },
      }),
    );
  });

  it('routes canonical image params into native fields and merged provider options', async () => {
    const model = createModel('gpt-image-2', {
      capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
      endpointTypes: [ENDPOINT_TYPE.OPENAI_RESPONSES],
    });
    const assistant = createAssistant(model.id);
    const service = new AiService(createServices({ assistant, model }));

    await service.generateImage({
      assistantId: assistant.id,
      mode: 'generate',
      paramValues: {
        aspectRatio: 'ASPECT_16_9',
        background: 'transparent',
        numImages: 2,
        quality: 'high',
        seed: 42,
      },
      prompt: 'draw a cherry',
      uniqueModelId: model.id,
    });

    expect(generateImageMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      expect.objectContaining({
        aspectRatio: '16:9',
        n: 2,
        providerOptions: expect.objectContaining({
          'openai-compatible': expect.objectContaining({
            customFlag: true,
            reasoningEffort: 'low',
          }),
          'test-provider': expect.objectContaining({
            background: 'transparent',
            quality: 'high',
            seed: 42,
          }),
        }),
        seed: 42,
      }),
    );
  });
});

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
        context: expect.objectContaining({
          abortSignal: controller.signal,
          assistant,
          chatId: 'topic-1',
          requestId: expect.any(String),
        }),
        options: expect.objectContaining({ stopWhen: expect.any(Function) }),
        plugins: expect.not.arrayContaining([expect.objectContaining({ name: 'webSearch' })]),
        repairToolCall: expect.any(Function),
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

  it('exposes external search to report missing configuration when no native search exists', async () => {
    const model = createModel('gpt-4o-mini', {
      capabilities: [MODEL_CAPABILITY.FUNCTION_CALL],
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
        plugins: expect.not.arrayContaining([expect.objectContaining({ name: 'webSearch' })]),
        tools: expect.objectContaining({ web_search: expect.any(Object) }),
      }),
    );
  });

  it('forces provider-native search for OpenRouter sonar models even when external search is configured', async () => {
    const provider = createProvider({ id: 'openrouter', presetProviderId: 'openrouter' });
    const model = createModel('perplexity/sonar-pro', { providerId: 'openrouter' });
    const assistant = createAssistant(model.id);
    const service = new AiService(
      createServices({ assistant, model, provider, webSearchProviderId: 'tavily' }),
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

describe('AiService MCP tool injection', () => {
  const builtInTools = {
    location_get_current: { description: 'location' },
  } as unknown as ToolSet;
  const mcpTools = { mcp__serverone__search: { description: 'search' } } as unknown as ToolSet;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function streamWith(services: AiServiceDependencies, assistant: Assistant) {
    return new AiService(services).streamText({
      assistantId: assistant.id,
      chatId: 'topic-1',
      messages: [],
      requestOptions: { signal: new AbortController().signal },
      trigger: 'submit-message',
    });
  }

  it('injects MCP tools with a bounded stopWhen for function-calling models', async () => {
    const model = createModel('gpt-4o-mini', {
      capabilities: [MODEL_CAPABILITY.FUNCTION_CALL],
    });
    const assistant = createAssistant(model.id);
    assistant.settings.enableMaxToolCalls = true;
    assistant.settings.maxToolCalls = 3;

    await streamWith(createServices({ assistant, mcpTools, model }), assistant);

    const params = mockAgentConstructor.mock.calls.at(-1)?.[0];
    expect(params.tools).toEqual(
      expect.objectContaining({ mcp__serverone__search: expect.any(Object) }),
    );
    expect(params.options.stopWhen({ steps: Array.from({ length: 2 }, () => ({})) })).toBe(false);
    expect(params.options.stopWhen({ steps: Array.from({ length: 3 }, () => ({})) })).toBe(true);
  });

  it('does not even ask for MCP tools when the model cannot call functions', async () => {
    const model = createModel('gpt-4o-mini', { capabilities: [] });
    const assistant = createAssistant(model.id);
    const services = createServices({ assistant, mcpTools, model });

    await streamWith(services, assistant);

    expect(services.tools.resolveForRequest).not.toHaveBeenCalled();
    expect(mockAgentConstructor.mock.calls.at(-1)?.[0].tools).toBeUndefined();
  });

  it('does not inject MCP tools on the generateText path', async () => {
    const model = createModel('gpt-4o-mini', {
      capabilities: [MODEL_CAPABILITY.FUNCTION_CALL],
    });
    const assistant = createAssistant(model.id);
    const services = createServices({ assistant, mcpTools, model });

    await new AiService(services).generateText({
      assistantId: assistant.id,
      messages: [],
      requestOptions: { signal: new AbortController().signal },
    });

    expect(services.tools.resolveForRequest).not.toHaveBeenCalled();
  });

  it('merges built-in, MCP, and external web-search tools', async () => {
    const model = createModel('gpt-4o-mini', {
      capabilities: [MODEL_CAPABILITY.FUNCTION_CALL, MODEL_CAPABILITY.WEB_SEARCH],
    });
    const assistant = createAssistant(model.id);
    assistant.settings.enableWebSearch = true;

    await streamWith(
      createServices({
        assistant,
        builtInTools,
        mcpTools,
        model,
        webSearchProviderId: 'tavily',
      }),
      assistant,
    );

    expect(mockAgentConstructor.mock.calls.at(-1)?.[0].tools).toEqual(
      expect.objectContaining({
        location_get_current: expect.any(Object),
        mcp__serverone__search: expect.any(Object),
        web_search: expect.any(Object),
      }),
    );
  });

  it('omits tools entirely when the MCP cache has nothing to offer', async () => {
    // A cold cache is the normal first-message state. `tools: {}` would still
    // switch on stopWhen and be sent to the provider, so it has to be undefined.
    const model = createModel('gpt-4o-mini', {
      capabilities: [MODEL_CAPABILITY.FUNCTION_CALL],
    });
    const assistant = createAssistant(model.id);
    const services = createServices({ assistant, model });

    await streamWith(services, assistant);

    expect(services.tools.resolveForRequest).toHaveBeenCalledWith(
      expect.objectContaining({ assistant }),
    );
    const params = mockAgentConstructor.mock.calls.at(-1)?.[0];
    expect(params.tools).toBeUndefined();
    expect(params.options.stopWhen).toBeUndefined();
  });

  it('appends deferred-tool guidance only when tool_search is exposed', async () => {
    const model = createModel('gpt-4o-mini', {
      capabilities: [MODEL_CAPABILITY.FUNCTION_CALL],
    });
    const assistant = createAssistant(model.id);
    const services = createServices({ assistant, model });
    services.tools.resolveForRequest.mockResolvedValueOnce({
      deferredEntries: [
        {
          defer: 'auto',
          description: 'Search docs',
          name: 'mcp__server__search',
          namespace: 'mcp:Server',
          tool: {} as never,
        },
      ],
      tools: { tool_search: {} as never },
    });

    await streamWith(services, assistant);

    expect(mockAgentConstructor.mock.calls.at(-1)?.[0].system).toContain('<deferred-tools>');
    expect(mockAgentConstructor.mock.calls.at(-1)?.[0].system).toContain('mcp:Server');
  });
});

type TestAiServices = Omit<AiServiceDependencies, 'tools'> & {
  tools: {
    resolveForRequest: jest.Mock;
  };
  webSearch: {
    searchKeywords: jest.Mock;
  };
};

function createServices({
  assistant,
  builtInTools,
  defaultModelId,
  mcpTools,
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
  builtInTools?: ToolSet;
  defaultModelId?: UniqueModelId | null;
  mcpTools?: ToolSet;
  model?: Model;
  models?: Model[];
  provider?: Provider;
  webSearchProviderId?: string | null;
  webSearchPreferences?: {
    'chat.web_search.max_results': number;
    'chat.web_search.exclude_domains': string[];
  };
}): TestAiServices {
  const modelList = models ?? (model ? [model] : []);
  const modelsById = new Map(modelList.map((item) => [item.id, item]));

  const webSearch = {
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
  };
  const tools = {
    resolveForRequest: jest.fn(async ({ externalWebSearchEnabled }) => {
      const resolved = {
        ...builtInTools,
        ...mcpTools,
        ...(externalWebSearchEnabled
          ? { web_search: createWebSearchTool(webSearch as never) }
          : {}),
      };
      return {
        deferredEntries: [],
        tools: Object.keys(resolved).length > 0 ? resolved : undefined,
      };
    }),
  };

  return {
    assistant: {
      getById: jest.fn(async () => assistant),
    },
    fileEntry: {
      resolveUri: jest.fn(async () => undefined),
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
    tools,
    webSearch,
  } as unknown as TestAiServices;
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
