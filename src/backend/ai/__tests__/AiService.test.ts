import { createOpenAI } from '@ai-sdk/openai';
import { ENDPOINT_TYPE, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';

import { AiService, type AiServiceDependencies } from '@/backend/ai/AiService';
import { providerRegistryService } from '@/backend/data/services/ProviderRegistryService';
import {
  installProviderRegistryTestSnapshot,
  providerRegistryTestSnapshot,
} from '@/backend/data/services/providerRegistryTestSnapshot';
import { createUniqueModelId, type Model, type UniqueModelId } from '@/shared/data/types/model';
import type { AuthConfig, Provider } from '@/shared/data/types/provider';

const mockGenerate = jest.fn(async () => ({ text: 'ok', usage: undefined }));
const mockGeneratorConstructor = jest.fn();

jest.mock('@cherrystudio/ai-core', () => ({
  definePlugin: jest.fn((plugin) => plugin),
  generateImage: jest.fn(),
}));

jest.mock('@/backend/ai/generation/AiSdkGenerator', () => ({
  AiSdkGenerator: jest.fn().mockImplementation((params) => {
    mockGeneratorConstructor(params);
    return { generate: mockGenerate };
  }),
}));

beforeEach(installProviderRegistryTestSnapshot);

describe('AiService.listModels', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('passes the Vertex service-account adapter to model listing', async () => {
    const provider = createProvider({
      authType: 'iam-gcp',
      defaultChatEndpoint: ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
      endpointConfigs: {
        [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT]: {
          adapterFamily: 'google-vertex',
          baseUrl: 'https://us-central1-aiplatform.googleapis.com',
        },
      },
      id: 'vertexai',
      presetProviderId: 'vertexai',
    });
    const privateKey = '-----BEGIN PRIVATE KEY-----\nMIIabc\n-----END PRIVATE KEY-----';
    const authConfig: AuthConfig = {
      credentials: { client_email: 'svc@example.com', private_key: privateKey },
      location: 'us-central1',
      project: 'project-id',
      type: 'iam-gcp',
    };
    const services = createServices({ authConfig, provider });
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () => new Response(JSON.stringify({ publisherModels: [] }), { status: 200 }),
      );

    await new AiService(services).listModels({ providerId: provider.id, throwOnError: true });

    expect(services.vertexAuth.getAuthorizationHeaders).toHaveBeenCalledWith({
      projectId: 'project-id',
      serviceAccount: { clientEmail: 'svc@example.com', privateKey },
    });
  });

  it('returns the registry catalog without requesting the upstream API', async () => {
    const provider = createProvider({
      id: 'login-provider',
      modelListSource: 'registry',
      presetProviderId: 'login-provider',
    });
    const registryModel = createModel('registry-model', { providerId: provider.id });
    const services = createServices({ provider, registryModels: [registryModel] });
    const fetchSpy = jest.spyOn(globalThis, 'fetch');

    await expect(new AiService(services).listModels({ providerId: provider.id })).resolves.toEqual([
      registryModel,
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('appends registry-only models and deduplicates publisher-prefixed twins', async () => {
    const provider = createProvider({ id: 'ppio', presetProviderId: 'ppio' });
    const registryTwin = createModel('qwen/qwen3', {
      apiModelId: 'qwen/qwen3',
      providerId: provider.id,
    });
    const registryOnly = createModel('z-image-turbo', {
      apiModelId: 'z-image-turbo',
      providerId: provider.id,
    });
    jest.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify({ data: [{ id: 'qwen3', name: 'Qwen3 from API' }] }), {
          status: 200,
        }),
    );
    const service = new AiService(
      createServices({ provider, registryModels: [registryTwin, registryOnly] }),
    );

    const result = await service.listModels({ providerId: provider.id, throwOnError: true });

    expect(result.map((model) => model.apiModelId)).toEqual(['qwen3', 'z-image-turbo']);
  });

  it('requires an explicit provider id', async () => {
    await expect(new AiService(createServices({})).listModels({} as never)).rejects.toThrow(
      'listModels requires providerId',
    );
  });
});

describe('AiService.checkModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    [
      'embedding capability',
      [MODEL_CAPABILITY.EMBEDDING],
      [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS],
      ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    ],
    ['rerank provider endpoint', [], [], ENDPOINT_TYPE.JINA_RERANK],
  ] as const)(
    'rejects unsupported %s models',
    async (kind, capabilities, endpointTypes, defaultChatEndpoint) => {
      const model = createModel(`test-${kind}`, {
        capabilities: [...capabilities],
        endpointTypes: [...endpointTypes],
      });
      const provider = createProvider({ defaultChatEndpoint });
      const service = new AiService(createServices({ model, provider }));

      await expect(service.checkModel({ timeout: 1000, uniqueModelId: model.id })).rejects.toThrow(
        `Mobile AI runtime does not support embedding or rerank models: ${model.id}`,
      );
      expect(mockGeneratorConstructor).not.toHaveBeenCalled();
    },
  );

  it('checks language models with a generateText probe', async () => {
    const model = createModel('gpt-4o-mini');
    const service = new AiService(createServices({ model }));

    await service.checkModel({
      requestOptions: { maxRetries: 2 },
      timeout: 1000,
      uniqueModelId: model.id,
    });

    expect(mockGeneratorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: model.modelId, system: 'test' }),
    );
    expect(mockGenerate).toHaveBeenCalledWith({ prompt: 'hi' }, expect.any(AbortSignal));
    expect(mockGeneratorConstructor.mock.calls[0][0].providerSettings.headers).not.toHaveProperty(
      'x-opencode-session',
    );
  });

  it.each([
    ['dashscope', 'qwen3.8-max', true],
    ['dashscope-copy', 'qwen3.8-max', true],
    ['dashscope', 'qwen3.8-max-preview', false],
  ] as const)(
    'serializes a %s / %s probe using the downloaded reasoning contract',
    async (providerId, apiModelId, supportsNonThinking) => {
      // Desktop 8d8649f: Max supports disabling thinking; Max Preview does not.
      providerRegistryService.installRemoteSnapshot({
        models: providerRegistryTestSnapshot.models,
        providerModels: {
          version: 'desktop-qwen38-probe',
          overrides: [
            {
              providerId: 'dashscope',
              modelId: apiModelId.replaceAll('.', '-'),
              apiModelId,
              name: apiModelId,
              reasoningContracts: {
                'openai-responses': {
                  support: {
                    controls: [
                      {
                        kind: 'effort',
                        values: supportsNonThinking
                          ? ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
                          : ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
                        default: 'xhigh',
                      },
                    ],
                  },
                  wire: {
                    ...(supportsNonThinking && {
                      off: {
                        operations: [
                          {
                            target: 'reasoningEffort',
                            value: { source: 'literal', value: 'none' },
                          },
                        ],
                      },
                    }),
                    effort: {
                      operations: [{ target: 'reasoningEffort', value: { source: 'effort' } }],
                    },
                  },
                },
              },
            },
          ],
        },
      });
      const provider = createProvider({
        id: providerId,
        presetProviderId: 'dashscope',
        endpointConfigs: {
          [ENDPOINT_TYPE.OPENAI_RESPONSES]: {
            adapterFamily: 'openai',
            baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/',
          },
        },
      });
      const model = createModel(apiModelId, {
        apiModelId,
        providerId,
        capabilities: [MODEL_CAPABILITY.REASONING],
        endpointTypes: [ENDPOINT_TYPE.OPENAI_RESPONSES],
      });

      await new AiService(createServices({ model, provider })).checkModel({
        uniqueModelId: model.id,
      });

      const [params] = mockGeneratorConstructor.mock.calls[0];
      let requestUrl: string | undefined;
      let requestBody: Record<string, unknown> | undefined;
      const sdkModel = createOpenAI({
        ...params.providerSettings,
        fetch: async (url, init) => {
          requestUrl = String(url);
          requestBody = JSON.parse(String(init?.body));
          throw new Error('request captured');
        },
      }).responses(params.modelId);

      await expect(
        sdkModel.doGenerate({
          prompt: [
            { role: 'system', content: params.system },
            { role: 'user', content: [{ type: 'text', text: 'hi' }] },
          ],
          providerOptions: params.options.providerOptions,
        }),
      ).rejects.toThrow('request captured');

      expect(requestUrl).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/responses');
      expect(requestBody).toMatchObject({
        model: apiModelId,
        store: false,
        input: [
          { role: 'system', content: 'test' },
          { role: 'user', content: [{ type: 'input_text', text: 'hi' }] },
        ],
      });
      expect(requestBody?.reasoning).toEqual(supportsNonThinking ? { effort: 'none' } : undefined);
    },
  );

  it.each([
    ['opencode', undefined, ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, 'openai-compatible'],
    ['opencode-copy', 'opencode', ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, 'openai-compatible'],
    ['opencode', undefined, ENDPOINT_TYPE.ANTHROPIC_MESSAGES, 'anthropic'],
    ['opencode-copy', 'opencode', ENDPOINT_TYPE.ANTHROPIC_MESSAGES, 'anthropic'],
    ['opencode', undefined, ENDPOINT_TYPE.OPENAI_RESPONSES, 'openai'],
    ['opencode-copy', 'opencode', ENDPOINT_TYPE.OPENAI_RESPONSES, 'openai'],
  ] as const)(
    'gives each %s health probe its own session header on %s / %s',
    async (id, presetProviderId, endpointType, adapterFamily) => {
      const provider = createProvider({
        id,
        presetProviderId,
        defaultChatEndpoint: endpointType,
        endpointConfigs: {
          [endpointType]: { adapterFamily, baseUrl: 'https://opencode.ai/zen/go/v1' },
        },
      });
      const model = createModel('test-model', { providerId: id, endpointTypes: [endpointType] });
      const service = new AiService(createServices({ model, provider }));

      await service.checkModel({ uniqueModelId: model.id });
      await service.checkModel({ uniqueModelId: model.id });

      const [first, second] = mockGeneratorConstructor.mock.calls.map(([params]) => params);
      expect(first.providerSettings.headers['x-opencode-session']).toEqual(expect.any(String));
      expect(first.providerSettings.headers['x-opencode-session']).toBe(first.context.requestId);
      expect(second.providerSettings.headers['x-opencode-session']).toBe(second.context.requestId);
      expect(first.context.requestId).not.toBe(second.context.requestId);
    },
  );

  it('preserves a case-insensitive explicit OpenCode session header during a health probe', async () => {
    const provider = createProvider({
      id: 'opencode-copy',
      presetProviderId: 'opencode',
      settings: { extraHeaders: { 'X-OpenCode-Session': 'configured-session' } },
    });
    const model = createModel('test-model', { providerId: provider.id });

    await new AiService(createServices({ model, provider })).checkModel({
      uniqueModelId: model.id,
    });

    const headers = mockGeneratorConstructor.mock.calls[0][0].providerSettings.headers;
    expect(headers['X-OpenCode-Session']).toBe('configured-session');
    expect(headers).not.toHaveProperty('x-opencode-session');
  });

  it('requires an explicit model id', async () => {
    const untypedRequest = { timeout: 1000 } as unknown as Parameters<AiService['checkModel']>[0];

    await expect(new AiService(createServices({})).checkModel(untypedRequest)).rejects.toThrow(
      'AiService requires uniqueModelId',
    );
  });
});

function createServices({
  authConfig = null,
  model,
  provider = createProvider(),
  registryModels = [],
}: {
  authConfig?: AuthConfig | null;
  model?: Model;
  provider?: Provider;
  registryModels?: Model[];
}): AiServiceDependencies {
  const modelsById = new Map<UniqueModelId, Model>(model ? [[model.id, model]] : []);
  return {
    aiUsageRecord: { recordInvocation: jest.fn(async () => undefined) },
    model: {
      getById: jest.fn(async (id: UniqueModelId) => modelsById.get(id) ?? null),
    },
    provider: {
      getAuthConfig: jest.fn(async () => authConfig),
      getByProviderId: jest.fn(async () => provider),
      getRotatedApiKey: jest.fn(async () => 'rotated-key'),
      resolveApiKey: jest.fn(async (_providerId: string, override?: string) => ({
        apiKeySelection: override
          ? { attribution: 'unknown' as const }
          : { attribution: 'explicit' as const, id: 'key-1', masked: 'ro****ey' },
        value: override ?? 'rotated-key',
      })),
    },
    providerRegistry: {
      getImageGenerationSupport: jest.fn(() => null),
      listProviderRegistryModels: jest.fn(() => registryModels),
    },
    vertexAuth: {
      getAuthorizationHeaders: jest.fn(async () => ({ Authorization: 'Bearer vertex-token' })),
    },
  };
}

function createProvider(overrides: Partial<Provider> = {}): Provider {
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
    endpointConfigs: {
      [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl: 'https://api.example.com' },
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
