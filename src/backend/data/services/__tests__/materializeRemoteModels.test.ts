import { MODEL_CAPABILITY, REASONING_FORMAT_PROFILES } from '@cherrystudio/provider-registry';

import { materializeRemoteModels } from '@/backend/data/services/materializeRemoteModels';
import {
  mergePresetModel,
  providerRegistryService,
} from '@/backend/data/services/ProviderRegistryService';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

jest.mock('@/backend/data/services/ProviderRegistryService', () => ({
  mergePresetModel: jest.fn(),
  providerRegistryService: { lookupModel: jest.fn() },
}));

const provider = { id: 'cherryin' } as Provider;

const reasoningProfile = {
  format: 'openai-chat',
  wire: REASONING_FORMAT_PROFILES['openai-chat'].wire,
} as const;

describe('materializeRemoteModels', () => {
  beforeEach(() => {
    jest.mocked(providerRegistryService.lookupModel).mockReturnValue({
      presetModel: null,
      reasoningProfile,
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

  it('uses apiModelId as the persisted provider model id when modelId is absent', () => {
    const result = materializeRemoteModels(provider, [
      {
        apiModelId: 'vendor/model-v1',
        name: 'Model V1',
      },
    ]);

    expect(result).toEqual([
      expect.objectContaining({
        apiModelId: 'vendor/model-v1',
        id: 'cherryin::vendor/model-v1',
        modelId: 'vendor/model-v1',
        name: 'Model V1',
      }),
    ]);
    expect(providerRegistryService.lookupModel).toHaveBeenCalledWith(
      'cherryin',
      'vendor/model-v1',
      expect.any(Object),
    );
  });

  it('enriches remote rows with registry metadata', () => {
    jest.mocked(providerRegistryService.lookupModel).mockReturnValue({
      presetModel: {
        capabilities: [MODEL_CAPABILITY.REASONING],
        id: 'deepseek-v3-2',
        metadata: {},
        name: 'DeepSeek V3.2',
      },
      reasoningProfile,
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
