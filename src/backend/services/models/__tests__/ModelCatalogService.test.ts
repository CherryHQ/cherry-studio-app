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
    getAuthConfig: jest.fn(async () => null),
    getCopilotToken: jest.fn(async () => 'copilot-token'),
    getStoredApiKey: jest.fn(async () => 'stored-key'),
    getVertexAuthHeaders: jest.fn(async () => ({})),
    listApiModels: jest.fn(async () => []),
    listRegistryModels: jest.fn(() => []),
    materialize: jest.fn((_, models) => models as Model[]),
    timeoutMs: 10_000,
    ...overrides,
  };
  return {
    dependencies,
    subject: new ModelCatalogService(
      {
        getVertexAuthHeaders: dependencies.getVertexAuthHeaders,
        listApiModels: dependencies.listApiModels,
      },
      dependencies,
    ),
  };
}

describe('ModelCatalogService', () => {
  it('uses a transient key without reading the stored provider key', async () => {
    const remote = model('openai', 'gpt-5');
    const { dependencies, subject } = createSubject();
    jest.mocked(dependencies.listApiModels).mockImplementation(async (_provider, context) => {
      expect(await context.getRotatedApiKey('openai')).toBe('draft-key');
      return [remote];
    });

    await expect(subject.list({ apiKey: 'draft-key', provider: provider() })).resolves.toEqual({
      models: [remote],
      remotelyProbed: true,
      source: 'api',
    });
    expect(dependencies.getStoredApiKey).not.toHaveBeenCalled();
  });

  it('reads registry-only catalogs without making a remote request', async () => {
    const registryModel = model('claude-code', 'claude-sonnet-4-5');
    const { dependencies, subject } = createSubject();
    jest.mocked(dependencies.listRegistryModels).mockReturnValue([registryModel]);
    const registryProvider = provider({
      id: 'claude-code',
      modelListSource: 'registry',
      name: 'Claude Code',
      presetProviderId: 'claude-code',
    });

    await expect(subject.list({ apiKey: 'ignored', provider: registryProvider })).resolves.toEqual({
      models: [registryModel],
      remotelyProbed: false,
      source: 'registry',
    });
    expect(dependencies.listApiModels).not.toHaveBeenCalled();
    expect(dependencies.listRegistryModels).toHaveBeenCalledWith({
      presetProviderId: 'claude-code',
      providerId: 'claude-code',
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
    const { dependencies, subject } = createSubject();
    jest.mocked(dependencies.listApiModels).mockResolvedValue([remoteTwin]);
    jest.mocked(dependencies.listRegistryModels).mockReturnValue([registryTwin, registryOnly]);
    const presetBackedProvider = provider({ id: 'custom-ppio', presetProviderId: 'ppio' });

    await expect(subject.list({ provider: presetBackedProvider })).resolves.toEqual({
      models: [remoteTwin, registryOnly],
      remotelyProbed: true,
      source: 'api',
    });
    expect(dependencies.listRegistryModels).toHaveBeenCalledWith({
      presetProviderId: 'ppio',
      providerId: 'custom-ppio',
    });
  });

  it('rejects a stalled API catalog with the stable timeout error', async () => {
    const { subject } = createSubject({
      listApiModels: jest.fn(() => new Promise(() => {})),
      timeoutMs: 1,
    });

    await expect(subject.list({ provider: provider() })).rejects.toBeInstanceOf(
      ModelPullTimeoutError,
    );
  });

  it('forwards external cancellation to the API request', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled');
    const { subject } = createSubject({
      listApiModels: jest.fn(async (_provider, _context, signal) => {
        controller.abort(reason);
        if (!signal.aborted) {
          await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
        }
        throw signal.reason;
      }),
    });

    await expect(subject.list({ provider: provider(), signal: controller.signal })).rejects.toBe(
      reason,
    );
  });
});
