import { createUniqueModelId, type Model } from '@cherrystudio/universal/data/types/model';
import { DEFAULT_API_FEATURES, type Provider } from '@cherrystudio/universal/data/types/provider';

import { ModelPullTimeoutError } from '@/shared/contracts';

import { ModelCatalogService, type ModelCatalogDependencies } from '../ModelCatalogService';

function provider(overrides: Partial<Provider> = {}): Provider {
  return {
    apiFeatures: DEFAULT_API_FEATURES,
    apiKeys: [],
    authType: 'api-key',
    id: 'openai',
    isEnabled: false,
    name: 'OpenAI',
    settings: {},
    ...overrides,
  };
}

function model(providerId: string, modelId: string): Model {
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

function createSubject(overrides: Partial<ModelCatalogDependencies> = {}) {
  const dependencies: ModelCatalogDependencies = {
    getAuthConfig: async () => null,
    getCopilotToken: async () => 'copilot-token',
    getStoredApiKey: async () => 'stored-key',
    getVertexAuthHeaders: async () => ({}),
    listApiModels: async () => [],
    listRegistryModels: () => [],
    materialize: (_, models) => models as Model[],
    timeoutMs: 10_000,
    ...overrides,
  };
  return new ModelCatalogService(
    {
      getVertexAuthHeaders: dependencies.getVertexAuthHeaders,
      listApiModels: dependencies.listApiModels,
    },
    dependencies,
  );
}

describe('ModelCatalogService', () => {
  it('uses a transient key without reading the stored provider key', async () => {
    const remote = model('openai', 'gpt-5');
    const subject = createSubject({
      getStoredApiKey: async () => {
        throw new Error('stored provider key must not be read');
      },
      listApiModels: async (_provider, context) =>
        (await context.getRotatedApiKey('openai')) === 'draft-key' ? [remote] : [],
    });

    await expect(subject.list({ apiKey: 'draft-key', provider: provider() })).resolves.toEqual({
      models: [remote],
      source: 'api',
    });
  });

  it('reads registry-only catalogs without making a remote request', async () => {
    const registryModel = model('claude-code', 'claude-sonnet-4-5');
    const subject = createSubject({
      listApiModels: async () => {
        throw new Error('registry-only catalogs must not make remote requests');
      },
      listRegistryModels: (input) =>
        input.presetProviderId === 'claude-code' && input.providerId === 'claude-code'
          ? [registryModel]
          : [],
    });
    const registryProvider = provider({
      id: 'claude-code',
      modelListSource: 'registry',
      name: 'Claude Code',
      presetProviderId: 'claude-code',
    });

    await expect(subject.list({ apiKey: 'ignored', provider: registryProvider })).resolves.toEqual({
      models: [registryModel],
      source: 'registry',
    });
  });

  it('merges registry-only models into API catalogs for a preset-backed provider instance', async () => {
    const remoteTwin = model('custom-ppio', 'qwen3');
    const registryTwin = {
      ...model('custom-ppio', 'qwen/qwen3'),
      apiModelId: 'qwen/qwen3',
    };
    const registryOnly = {
      ...model('custom-ppio', 'z-image-turbo'),
      apiModelId: 'z-image-turbo',
    };
    const subject = createSubject({
      listApiModels: async (inputProvider) =>
        inputProvider.id === 'custom-ppio' ? [remoteTwin] : [],
      listRegistryModels: (input) =>
        input.presetProviderId === 'ppio' && input.providerId === 'custom-ppio'
          ? [registryTwin, registryOnly]
          : [],
    });
    const presetBackedProvider = provider({ id: 'custom-ppio', presetProviderId: 'ppio' });

    await expect(subject.list({ provider: presetBackedProvider })).resolves.toEqual({
      models: [remoteTwin, registryOnly],
      source: 'api',
    });
  });

  it('rejects a stalled API catalog with the stable timeout error', async () => {
    const subject = createSubject({
      listApiModels: () => new Promise(() => {}),
      timeoutMs: 1,
    });

    await expect(subject.list({ provider: provider() })).rejects.toBeInstanceOf(
      ModelPullTimeoutError,
    );
  });

  it('forwards external cancellation to the API request', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled');
    const subject = createSubject({
      listApiModels: async (_provider, _context, signal) => {
        controller.abort(reason);
        if (!signal.aborted) {
          await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
        }
        throw signal.reason;
      },
    });

    await expect(subject.list({ provider: provider(), signal: controller.signal })).rejects.toBe(
      reason,
    );
  });
});
