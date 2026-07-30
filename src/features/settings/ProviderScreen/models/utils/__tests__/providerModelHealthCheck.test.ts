import { createUniqueModelId, type Model } from '@/data/types/model';

import {
  checkProviderModelsHealth,
  createProviderModelHealthCheckingStatuses,
  createProviderModelHealthPendingStatuses,
} from '../providerModelHealthCheck';

describe('provider model health check helpers', () => {
  test('checks selected models sequentially with the selected API key', async () => {
    const models = [model('gpt-4o'), model('gpt-4o-mini')];
    const checked: string[] = [];
    const onModelChecked = jest.fn();

    const results = await checkProviderModelsHealth(
      {
        apiKey: { id: 'key-1', key: 'sk-test' },
        checkModel: jest.fn(async ({ apiKey, modelId }) => {
          checked.push(`${modelId}:${apiKey}`);
          return { latency: checked.length * 100 };
        }),
        models,
        timeout: 1000,
      },
      onModelChecked,
    );

    expect(checked).toEqual(['openai::gpt-4o:sk-test', 'openai::gpt-4o-mini:sk-test']);
    expect(results).toEqual([
      { latency: 100, model: models[0], status: 'success' },
      { latency: 200, model: models[1], status: 'success' },
    ]);
    expect(onModelChecked).toHaveBeenNthCalledWith(1, results[0], 0);
    expect(onModelChecked).toHaveBeenNthCalledWith(2, results[1], 1);
  });

  test('records failed rows without stopping later checks', async () => {
    const models = [model('broken'), model('ok')];

    const results = await checkProviderModelsHealth({
      checkModel: jest.fn(async ({ modelId }) => {
        if (modelId === 'openai::broken') {
          throw new Error('Invalid API key');
        }
        return { latency: 120 };
      }),
      models,
    });

    expect(results).toEqual([
      { error: 'Invalid API key', model: models[0], status: 'failed' },
      { latency: 120, model: models[1], status: 'success' },
    ]);
  });

  test('stops checking when aborted', async () => {
    const controller = new AbortController();
    const models = [model('first'), model('second')];
    const checkModel = jest.fn(async () => {
      controller.abort(new Error('cancelled'));
      return { latency: 100 };
    });

    await expect(
      checkProviderModelsHealth({
        checkModel,
        models,
        signal: controller.signal,
      }),
    ).rejects.toThrow('cancelled');

    expect(checkModel).toHaveBeenCalledTimes(1);
  });

  test('creates pending and checking status rows', () => {
    const models = [model('gpt-4o')];

    expect(createProviderModelHealthPendingStatuses(models)).toEqual([
      { model: models[0], status: 'pending' },
    ]);
    expect(createProviderModelHealthCheckingStatuses(models)).toEqual([
      { model: models[0], status: 'checking' },
    ]);
  });
});

function model(modelId: string): Model {
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
  };
}
