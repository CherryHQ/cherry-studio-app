import { createUniqueModelId, type Model } from '@/shared/data/types/model';

import { createProviderModelHealthPendingStatuses } from '../providerModelHealthCheck';

describe('provider model health check presentation', () => {
  test('creates pending rows before a backend health session starts', () => {
    const model = createModel('gpt-4o');

    expect(createProviderModelHealthPendingStatuses([model])).toEqual([
      { model, status: 'pending' },
    ]);
  });
});

function createModel(modelId: string): Model {
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
