import { generateImage as aiCoreGenerateImage } from '@cherrystudio/ai-core';
import { ENDPOINT_TYPE, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';

import { AiService, type AiServiceDependencies } from '@/backend/ai/AiService';
import { installProviderRegistryTestSnapshot } from '@/backend/data/services/providerRegistryTestSnapshot';
import { createUniqueModelId, type Model, type UniqueModelId } from '@/shared/data/types/model';
import type { AuthConfig, Provider } from '@/shared/data/types/provider';

jest.mock('@cherrystudio/ai-core', () => ({
  generateImage: jest.fn(),
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

    expect(services.vertexAuth.getAuthorizationHeaders).toHaveBeenCalledWith(
      {
        providerId: provider.id,
        projectId: 'project-id',
        serviceAccount: { clientEmail: 'svc@example.com', privateKey },
      },
      undefined,
    );
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

describe('AiService.generateImage', () => {
  afterEach(() => {
    jest.mocked(aiCoreGenerateImage).mockReset();
  });

  it.each([
    ['generate', ENDPOINT_TYPE.OPENAI_RESPONSES],
    ['edit', ENDPOINT_TYPE.OPENAI_RESPONSES],
    ['generate', ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS],
    ['edit', ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS],
    ['generate', ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION],
  ] as const)(
    'keeps chat parameters out of image %s requests using %s connections',
    async (mode, endpointType) => {
      const provider = createProvider({
        defaultChatEndpoint: endpointType,
        endpointConfigs: {
          [endpointType]: { adapterFamily: 'openai', baseUrl: 'https://api.example.com' },
        },
        settings: { serviceTier: 'priority' },
      });
      const model = createModel('local-image', {
        apiModelId: 'gpt-image-2-2026-04-21',
        capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
      });
      const services = createServices({ model, provider });
      const signal = new AbortController().signal;
      const inputImages = mode === 'edit' ? ['data:image/png;base64,iVBORw0KGgo='] : undefined;
      jest.mocked(aiCoreGenerateImage).mockRejectedValue(new Error('image request captured'));

      await expect(
        new AiService(services).generateImage({
          apiKeyOverride: 'image-key',
          inputImages,
          mode,
          paramValues: { background: 'opaque', quality: 'high', size: '1024x1024' },
          prompt: 'Draw a cat.',
          requestOptions: {
            headers: { 'X-Image': 'test', unused: undefined },
            maxRetries: 2,
            signal,
          },
          uniqueModelId: model.id,
        }),
      ).rejects.toThrow('image request captured');

      const [, providerSettings, params] = jest.mocked(aiCoreGenerateImage).mock
        .calls[0] as unknown as [string, unknown, { providerOptions?: Record<string, unknown> }];
      expect(providerSettings).toMatchObject({
        apiKey: 'image-key',
        baseURL: 'https://api.example.com/v1',
      });
      expect(services.provider.resolveApiKey).toHaveBeenCalledTimes(1);
      expect(params).toMatchObject({
        abortSignal: signal,
        headers: { 'X-Image': 'test' },
        maxRetries: 2,
        model: 'gpt-image-2-2026-04-21',
        n: 1,
        prompt: inputImages ? { images: inputImages, text: 'Draw a cat.' } : 'Draw a cat.',
        size: '1024x1024',
      });
      expect(params.providerOptions?.openai).toEqual({ background: 'opaque', quality: 'high' });
    },
  );
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
