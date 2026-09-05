import type { ModelsModule } from '@/shared/contracts';
import { ModelPullError, ModelPullTimeoutError, ProviderSetupError } from '@/shared/contracts';
import { createUniqueModelId, type Model, type UniqueModelId } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { createModelsModule, type ModelsModuleDependencies } from '../createModelsModule';

const provider = {
  id: 'openai',
  isEnabled: false,
  authType: 'api-key',
  defaultChatEndpoint: 'openai-chat-completions',
  endpointConfigs: { 'openai-chat-completions': { baseUrl: 'https://example.test/v1' } },
} as Provider;

function model(modelId: string, overrides: Partial<Model> = {}): Model {
  return {
    capabilities: [],
    id: createUniqueModelId('openai', modelId),
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    modelId,
    name: modelId,
    providerId: 'openai',
    supportsStreaming: true,
    ...overrides,
  };
}

function createSubject(overrides: Partial<ModelsModuleDependencies> = {}) {
  const dependencies: ModelsModuleDependencies = {
    checkChatModel: jest.fn(async () => ({ status: 'success' as const, latency: 10 })),
    ai: {
      checkModel: jest.fn(async () => ({ latency: 12 })),
      listModels: jest.fn(async () => []),
    },
    isSystemSupportedModel: jest.fn(() => true),
    materializeRemoteModels: (_provider, models) => models as Model[],
    models: {
      get: jest.fn(async (id: UniqueModelId) => model(id.split('::')[1] ?? id)),
      list: jest.fn(async () => []),
      reconcile: jest.fn(async (_providerId, input) => ({
        added: input.toAdd.map((item) => model(item.modelId)),
        removedIds: input.toRemove,
      })),
    },
    providers: {
      auth: async () => null,
      get: jest.fn(async () => provider),
      keys: jest.fn(async () => [{ id: 'key-1', key: 'configured', isEnabled: true }]),
    },
    ...overrides,
  };
  const backend: ModelsModule = createModelsModule(dependencies);
  return { backend, dependencies };
}

describe('createModelsModule', () => {
  it('returns a pull preview and keeps persistence behind reconcile', async () => {
    const local = model('old', { presetModelId: 'old' });
    const remote = model('new');
    const { backend, dependencies } = createSubject();
    jest.mocked(dependencies.models.list).mockResolvedValue([local]);
    jest.mocked(dependencies.ai.listModels).mockResolvedValue([remote]);

    await expect(backend.pull('openai')).resolves.toEqual({
      preview: { added: [remote], missing: [local] },
      status: 'changes',
    });
    expect(dependencies.models.reconcile).not.toHaveBeenCalled();
  });

  it('reports a remote addition when the only local model is custom', async () => {
    const local = model('custom');
    const remote = model('remote');
    const { backend, dependencies } = createSubject();
    jest.mocked(dependencies.models.list).mockResolvedValue([local]);
    jest.mocked(dependencies.ai.listModels).mockResolvedValue([remote]);

    await expect(backend.pull('openai')).resolves.toEqual({
      preview: { added: [remote], missing: [] },
      status: 'changes',
    });
  });

  it('keeps unsupported local and remote models out of the pull preview', async () => {
    const supported = model('supported');
    const unsupportedLocal = model('unsupported-local', { presetModelId: 'unsupported-local' });
    const unsupportedRemote = model('unsupported-remote');
    const { backend, dependencies } = createSubject({
      isSystemSupportedModel: jest.fn((_provider, candidate) => candidate.id === supported.id),
    });
    jest.mocked(dependencies.models.list).mockResolvedValue([supported, unsupportedLocal]);
    jest.mocked(dependencies.ai.listModels).mockResolvedValue([supported, unsupportedRemote]);

    await expect(backend.pull('openai')).resolves.toEqual({
      status: 'up-to-date',
    });
  });

  it('returns an up-to-date result without an implicit enable result', async () => {
    const current = model('current');
    const { backend, dependencies } = createSubject();
    jest.mocked(dependencies.models.list).mockResolvedValue([current]);
    jest.mocked(dependencies.ai.listModels).mockResolvedValue([current]);

    await expect(backend.pull('openai')).resolves.toEqual({
      status: 'up-to-date',
    });
  });

  it('reports model health sequentially', async () => {
    const first = model('first');
    const second = model('second');
    const onResult = jest.fn();
    const { backend, dependencies } = createSubject();
    jest.mocked(dependencies.models.get).mockResolvedValueOnce(first).mockResolvedValueOnce(second);

    await expect(
      backend.checkHealth({
        modelIds: [first.id, second.id],
        onResult,
        providerId: 'openai',
      }),
    ).resolves.toEqual([
      { latency: 12, model: first, status: 'success' },
      { latency: 12, model: second, status: 'success' },
    ]);
    expect(onResult).toHaveBeenCalledTimes(2);
    expect(dependencies.ai.checkModel).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ uniqueModelId: second.id }),
    );
  });

  it('continues after a failed health check', async () => {
    const first = model('first');
    const second = model('second');
    const onResult = jest.fn();
    const { backend, dependencies } = createSubject();
    jest.mocked(dependencies.models.get).mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    jest
      .mocked(dependencies.ai.checkModel)
      .mockRejectedValueOnce(new Error('Invalid API key'))
      .mockResolvedValueOnce({ latency: 18 });

    await expect(
      backend.checkHealth({
        modelIds: [first.id, second.id],
        onResult,
        providerId: 'openai',
      }),
    ).resolves.toEqual([
      { error: 'Invalid API key', model: first, status: 'failed' },
      { latency: 18, model: second, status: 'success' },
    ]);
    expect(onResult).toHaveBeenCalledTimes(2);
  });

  it('stops a health check when its external signal aborts', async () => {
    const first = model('first');
    const second = model('second');
    const controller = new AbortController();
    const { backend, dependencies } = createSubject();
    jest.mocked(dependencies.models.get).mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    jest.mocked(dependencies.ai.checkModel).mockImplementationOnce(async () => {
      controller.abort(new Error('cancelled'));
      return { latency: 12 };
    });

    await expect(
      backend.checkHealth({
        modelIds: [first.id, second.id],
        providerId: 'openai',
        signal: controller.signal,
      }),
    ).rejects.toThrow('cancelled');
    expect(dependencies.ai.checkModel).toHaveBeenCalledTimes(1);
  });

  it('rejects a stalled pull with the stable contract error', async () => {
    const { backend } = createSubject({
      ai: {
        checkModel: jest.fn(async () => ({ latency: 1 })),
        listModels: jest.fn(() => new Promise(() => {})),
      },
      pullTimeoutMs: 1,
    });

    await expect(backend.pull('openai')).rejects.toBeInstanceOf(ModelPullTimeoutError);
  });
  it('blocks a missing required API key before dispatching a model request', async () => {
    const { backend, dependencies } = createSubject();
    jest.mocked(dependencies.providers.keys).mockResolvedValue([]);
    await expect(backend.pull('openai')).rejects.toEqual(new ProviderSetupError('missing-api-key'));
    expect(dependencies.ai.listModels).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'authentication'],
    [403, 'authentication'],
    [404, 'unavailable'],
    [429, 'rate-limited'],
  ] as const)('maps HTTP %s to a recoverable model-list error', async (statusCode, reason) => {
    const { backend, dependencies } = createSubject();
    jest
      .mocked(dependencies.ai.listModels)
      .mockRejectedValue({ statusCode, message: 'private diagnostic' });
    await expect(backend.pull('openai')).rejects.toEqual(new ModelPullError(reason));
  });

  it('does not publish a completed preview after cancellation', async () => {
    const controller = new AbortController();
    const { backend, dependencies } = createSubject();
    jest.mocked(dependencies.ai.listModels).mockImplementation(async () => {
      controller.abort(new Error('cancelled'));
      return [model('remote')];
    });
    await expect(backend.pull('openai', controller.signal)).rejects.toThrow('cancelled');
  });
});
