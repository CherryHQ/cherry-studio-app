import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import {
  mergePresetModel,
  providerRegistryService,
} from '@/backend/infrastructure/services/ProviderRegistryService';
import { materializeRemoteModels } from '@/backend/infrastructure/services/materializeRemoteModels';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

jest.mock('@/backend/infrastructure/services/ProviderRegistryService', () => ({
  mergePresetModel: jest.fn(),
  providerRegistryService: { lookupModel: jest.fn() },
}));

const provider = { id: 'cherryin' } as Provider;

describe('materializeRemoteModels', () => {
  beforeEach(() => {
    jest.mocked(providerRegistryService.lookupModel).mockReturnValue({
      presetModel: null,
      registryOverride: null,
    });
  });

  it('normalizes ids, preserves ownership fields, and drops invalid duplicates', () => {
    const result = materializeRemoteModels(provider, [
      {
        group: 'anthropic',
        modelId: ' anthropic/claude-sonnet-4-5 ',
        ownedBy: 'custom',
      },
      { modelId: 'anthropic/claude-sonnet-4-5' },
      {},
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      group: 'anthropic',
      id: 'cherryin::anthropic/claude-sonnet-4-5',
      modelId: 'anthropic/claude-sonnet-4-5',
      name: 'anthropic/claude-sonnet-4-5',
      ownedBy: 'custom',
      providerId: 'cherryin',
    });
  });

  it('enriches remote rows with registry metadata', () => {
    jest.mocked(providerRegistryService.lookupModel).mockReturnValue({
      presetModel: {
        capabilities: [MODEL_CAPABILITY.REASONING],
        id: 'deepseek-v3-2',
        metadata: {},
        name: 'DeepSeek V3.2',
      },
      registryOverride: null,
    });
    jest.mocked(mergePresetModel).mockReturnValue({
      capabilities: [MODEL_CAPABILITY.REASONING],
      name: 'DeepSeek V3.2',
    } as Model);

    expect(
      materializeRemoteModels(provider, [{ modelId: 'agent/deepseek-v3.2' }])[0],
    ).toMatchObject({
      capabilities: [MODEL_CAPABILITY.REASONING],
      modelId: 'agent/deepseek-v3.2',
      name: 'DeepSeek V3.2',
      presetModelId: 'deepseek-v3-2',
    });
  });
});
