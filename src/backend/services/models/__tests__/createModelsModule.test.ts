import type { ModelsModule } from '@/shared/contracts';
import { ModelPullTimeoutError } from '@/shared/contracts';
import { createUniqueModelId, type Model, type UniqueModelId } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { createModelsModule, type ModelsModuleDependencies } from '../createModelsModule';

const provider = {
  id: 'openai',
  isEnabled: false,
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
      get: jest.fn(async () => provider),
      update: jest.fn(async () => ({ ...provider, isEnabled: true })),
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
      providerEnabled: true,
      status: 'up-to-date',
    });
  });

  it('enables a disabled provider after an up-to-date pull with local models', async () => {
    const current = model('current');
    const { backend, dependencies } = createSubject();
    jest.mocked(dependencies.models.list).mockResolvedValue([current]);
    jest.mocked(dependencies.ai.listModels).mockResolvedValue([current]);

    await expect(backend.pull('openai')).resolves.toEqual({
      providerEnabled: true,
      status: 'up-to-date',
    });
    expect(dependencies.providers.update).toHaveBeenCalledWith('openai', { isEnabled: true });
  });

  it('reports model health sequentially and enables the provider after success', async () => {
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
    expect(dependencies.providers.update).toHaveBeenCalled();
  });

  it('continues after a failed health check and does not enable the provider', async () => {
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
    expect(dependencies.providers.update).not.toHaveBeenCalled();
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
    expect(dependencies.providers.update).not.toHaveBeenCalled();
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
});
