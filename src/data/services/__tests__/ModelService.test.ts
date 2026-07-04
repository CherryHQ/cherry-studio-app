import type { DbService } from '@/data/db/DbService';
import { userModelTable } from '@/data/db/schemas/userModel';
import { REASONING_EFFORT } from '@/data/types/model';
import { ModelService } from '../ModelService';
import { providerRegistryService } from '../ProviderRegistryService';

jest.mock('@/data/db/schemas/userModel', () => ({
  userModelTable: {
    id: 'id',
    providerId: 'providerId',
  },
}));

jest.mock('../utils/orderKey', () => ({
  insertManyWithOrderKey: jest.fn(async (_tx, _table, values) =>
    values.map((value: Record<string, unknown>, index: number) => ({
      ...value,
      orderKey: `a${index}`,
    })),
  ),
  insertWithOrderKey: jest.fn(),
}));

describe('ModelService', () => {
  test('enriches getById results with current registry reasoning metadata', async () => {
    const row = {
      capabilities: [],
      contextWindow: null,
      customEndpointUrl: null,
      description: null,
      endpointTypes: null,
      group: null,
      id: 'openai::gpt-5',
      inputModalities: null,
      isDeprecated: false,
      isEnabled: true,
      isHidden: false,
      maxInputTokens: null,
      maxOutputTokens: null,
      modelId: 'gpt-5',
      name: 'GPT-5',
      outputModalities: null,
      ownedBy: null,
      parameters: null,
      presetModelId: 'gpt-5',
      pricing: null,
      providerId: 'openai',
      reasoning: null,
      supportsStreaming: true,
      userOverrides: null,
    };
    const db = {
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({
            limit: jest.fn(async () => [row]),
          })),
        })),
      })),
    };
    const dbService = {
      getDb: () => db,
    } as unknown as DbService;
    const service = new ModelService(dbService);

    await expect(service.getById('openai::gpt-5')).resolves.toMatchObject({
      reasoning: {
        supportedEfforts: [
          REASONING_EFFORT.MINIMAL,
          REASONING_EFFORT.LOW,
          REASONING_EFFORT.MEDIUM,
          REASONING_EFFORT.HIGH,
        ],
      },
    });
  });

  test('reconciles provider models in one write transaction', async () => {
    const deletedWhereClauses: unknown[] = [];
    const tx = {
      delete: jest.fn(() => ({
        where: jest.fn(async (whereClause) => {
          deletedWhereClauses.push(whereClause);
        }),
      })),
    };
    const dbService = {
      withWriteTx: jest.fn(async (callback) => callback(tx)),
    } as unknown as DbService;
    const service = new ModelService(dbService);

    const result = await service.reconcileProviderModels('openai', {
      toAdd: [{ modelId: 'gpt-4o', name: 'GPT-4o', providerId: 'ignored-provider' }],
      toRemove: ['openai::old-model', 'openai::old-model'],
    });

    expect(dbService.withWriteTx).toHaveBeenCalledTimes(1);
    expect(tx.delete).toHaveBeenCalledWith(userModelTable);
    expect(deletedWhereClauses).toHaveLength(1);
    expect(result.added).toEqual([
      expect.objectContaining({
        id: 'openai::gpt-4o',
        modelId: 'gpt-4o',
        name: 'GPT-4o',
        providerId: 'openai',
      }),
    ]);
    expect(result.removedIds).toEqual(['openai::old-model']);
  });

  test('persists remote ownedBy without treating it as group during reconcile', async () => {
    const dbService = {
      withWriteTx: jest.fn(async (callback) => callback({})),
    } as unknown as DbService;
    const service = new ModelService(dbService);

    const result = await service.reconcileProviderModels('cherryin', {
      toAdd: [
        {
          modelId: 'anthropic/claude-sonnet-4-5',
          name: 'Claude Sonnet 4.5',
          ownedBy: 'custom',
          providerId: 'ignored-provider',
        },
      ],
    });

    expect(result.added).toEqual([
      expect.objectContaining({
        apiModelId: 'anthropic/claude-sonnet-4-5',
        id: 'cherryin::anthropic/claude-sonnet-4-5',
        modelId: 'anthropic/claude-sonnet-4-5',
        ownedBy: 'custom',
        providerId: 'cherryin',
      }),
    ]);
  });

  test('creates standalone registry override models through synthesized presets', async () => {
    const dbService = {
      withWriteTx: jest.fn(async (callback) => callback({})),
    } as unknown as DbService;
    const service = new ModelService(dbService);
    const registryData = providerRegistryService.lookupModel('302ai', 'chatgpt-4o-latest');

    const result = await service.reconcileProviderModels('302ai', {
      toAdd: [
        {
          modelId: 'chatgpt-4o-latest',
          providerId: 'ignored-provider',
          registryData,
        },
      ],
    });

    expect(result.added).toEqual([
      expect.objectContaining({
        id: '302ai::chatgpt-4o-latest',
        modelId: 'chatgpt-4o-latest',
        name: 'chatgpt-4o-latest',
        presetModelId: 'chatgpt-4o-latest',
        providerId: '302ai',
      }),
    ]);
  });

  test('skips transaction for empty reconcile input', async () => {
    const dbService = {
      withWriteTx: jest.fn(),
    } as unknown as DbService;
    const service = new ModelService(dbService);

    await expect(service.reconcileProviderModels('openai', {})).resolves.toEqual({
      added: [],
      removedIds: [],
    });
    expect(dbService.withWriteTx).not.toHaveBeenCalled();
  });
});
