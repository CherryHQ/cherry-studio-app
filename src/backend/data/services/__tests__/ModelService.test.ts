import type { DbService } from '@/backend/data/db/DbService';
import { userModelTable } from '@/backend/data/db/schemas/userModel';
import { REASONING_EFFORT } from '@/shared/data/types/model';
import type { PreferenceService } from '../../PreferenceService';
import { ModelService } from '../ModelService';
import type { PinService } from '../PinService';
import { providerRegistryService } from '../ProviderRegistryService';
import { insertManyWithOrderKey } from '../utils/orderKey';

jest.mock('@/backend/data/db/schemas/userModel', () => ({
  userModelTable: {
    id: 'id',
    presetModelId: 'presetModelId',
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
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('preserves persisted reasoning when enriching a model from the registry', async () => {
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
      reasoning: {
        supportedEfforts: [REASONING_EFFORT.LOW],
      },
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
    const service = createService(dbService);

    await expect(service.getById('openai::gpt-5')).resolves.toMatchObject({
      reasoning: {
        supportedEfforts: [REASONING_EFFORT.LOW],
      },
    });
  });

  test('reconciles provider models in one write transaction', async () => {
    const deletedWhereClauses: unknown[] = [];
    const tx = {
      delete: jest.fn(() => ({
        where: jest.fn((whereClause) => {
          deletedWhereClauses.push(whereClause);
          return {
            returning: jest.fn(async () => [
              { id: 'openai::old-model', presetModelId: 'old-model' },
            ]),
          };
        }),
      })),
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(async () => [{ id: 'openai::old-model', presetModelId: 'old-model' }]),
        })),
      })),
    };
    const dbService = {
      withWriteTx: jest.fn(async (callback) => callback(tx)),
    } as unknown as DbService;
    const service = createService(dbService);

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

  test('protects custom and default models while replacing eligible models atomically', async () => {
    const removedRows = [
      { id: 'openai::replace', presetModelId: 'replace' },
      { id: 'openai::stale', presetModelId: 'stale' },
    ];
    const tx = {
      delete: jest.fn(() => ({
        where: jest.fn(() => ({ returning: jest.fn(async () => removedRows) })),
      })),
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(async () => [
            { id: 'openai::custom', presetModelId: null },
            { id: 'openai::custom-empty', presetModelId: '' },
            { id: 'openai::default', presetModelId: 'default' },
            ...removedRows,
          ]),
        })),
      })),
    };
    const dbService = {
      withWriteTx: jest.fn(async (callback) => callback(tx)),
    } as unknown as DbService;
    const preferenceService = {
      get: jest.fn(async () => 'openai::default'),
    } as unknown as PreferenceService;
    const pinService = {
      purgeForEntitiesTx: jest.fn(async () => undefined),
    } as unknown as PinService;
    const service = new ModelService(dbService, preferenceService, pinService);

    const result = await service.reconcileProviderModels('openai', {
      toAdd: [{ modelId: 'replace', providerId: 'openai' }],
      toRemove: [
        'openai::custom',
        'openai::custom-empty',
        'openai::default',
        'openai::replace',
        'openai::stale',
      ],
    });

    expect(result.removedIds).toEqual(['openai::replace', 'openai::stale']);
    expect(pinService.purgeForEntitiesTx).toHaveBeenCalledWith(tx, 'model', [
      'openai::replace',
      'openai::stale',
    ]);
    expect(tx.delete.mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(insertManyWithOrderKey).mock.invocationCallOrder.at(-1) ??
        Number.POSITIVE_INFINITY,
    );
  });

  test('chunks large reconcile reads, deletes, and inserts for SQLite limits', async () => {
    const removalRows = Array.from({ length: 1001 }, (_, index) => ({
      id: `openai::old-${index}`,
      presetModelId: `old-${index}`,
    }));
    const readChunks = [
      removalRows.slice(0, 500),
      removalRows.slice(500, 1000),
      removalRows.slice(1000),
    ];
    const deleteChunks = [...readChunks];
    const selectWhere = jest.fn(async () => readChunks.shift() ?? []);
    const returning = jest.fn(async () => deleteChunks.shift() ?? []);
    const tx = {
      delete: jest.fn(() => ({
        where: jest.fn(() => ({ returning })),
      })),
      select: jest.fn(() => ({
        from: jest.fn(() => ({ where: selectWhere })),
      })),
    };
    const pinService = {
      purgeForEntitiesTx: jest.fn(async () => undefined),
    } as unknown as PinService;
    const service = new ModelService(
      { withWriteTx: jest.fn(async (callback) => callback(tx)) } as unknown as DbService,
      { get: jest.fn(async () => null) } as unknown as PreferenceService,
      pinService,
    );

    const result = await service.reconcileProviderModels('openai', {
      toAdd: Array.from({ length: 1001 }, (_, index) => ({
        modelId: `new-${index}`,
        providerId: 'openai',
      })),
      toRemove: removalRows.map((row) => row.id),
    });

    expect(selectWhere).toHaveBeenCalledTimes(3);
    expect(returning).toHaveBeenCalledTimes(3);
    const insertCalls = jest.mocked(insertManyWithOrderKey).mock.calls;
    expect(insertCalls.length).toBeGreaterThan(3);
    for (const [, , insertedValues] of insertCalls) {
      const variablesPerRow = Object.keys(insertedValues[0] ?? {}).length + 3;
      expect(insertedValues.length * variablesPerRow).toBeLessThanOrEqual(999);
    }
    expect(result.added).toHaveLength(1001);
    expect(result.removedIds).toHaveLength(1001);
    expect(pinService.purgeForEntitiesTx).toHaveBeenCalledWith(tx, 'model', result.removedIds);
  });

  test('does not persist remote ownedBy during reconcile', async () => {
    const dbService = {
      withWriteTx: jest.fn(async (callback) => callback({})),
    } as unknown as DbService;
    const service = createService(dbService);

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

    expect(result.added[0]).toMatchObject({
      apiModelId: 'anthropic/claude-sonnet-4-5',
      id: 'cherryin::anthropic/claude-sonnet-4-5',
      modelId: 'anthropic/claude-sonnet-4-5',
      providerId: 'cherryin',
    });
    expect(result.added[0]).not.toHaveProperty('ownedBy');
  });

  test('creates standalone registry override models through synthesized presets', async () => {
    const dbService = {
      withWriteTx: jest.fn(async (callback) => callback({})),
    } as unknown as DbService;
    const service = createService(dbService);
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
    const service = createService(dbService);

    await expect(service.reconcileProviderModels('openai', {})).resolves.toEqual({
      added: [],
      removedIds: [],
    });
    expect(dbService.withWriteTx).not.toHaveBeenCalled();
  });

  // Unlike reconcile, an explicit delete reaches a hand-added model: the user is
  // pointing at the row rather than the remote list failing to mention it.
  test('deletes a model without a preset and purges its pins', async () => {
    const tx = {
      delete: jest.fn(() => ({
        where: jest.fn(() => ({ returning: jest.fn(async () => [{ id: 'openai::custom' }]) })),
      })),
    };
    const pinService = {
      purgeForEntitiesTx: jest.fn(async () => undefined),
    } as unknown as PinService;
    const service = new ModelService(
      { withWriteTx: jest.fn(async (callback) => callback(tx)) } as unknown as DbService,
      { get: jest.fn(async () => null) } as unknown as PreferenceService,
      pinService,
    );

    await expect(service.delete('openai::custom')).resolves.toBe(true);
    expect(pinService.purgeForEntitiesTx).toHaveBeenCalledWith(tx, 'model', ['openai::custom']);
  });

  test('refuses to delete the chat default and never opens a transaction for it', async () => {
    const dbService = { withWriteTx: jest.fn() } as unknown as DbService;
    const service = new ModelService(
      dbService,
      { get: jest.fn(async () => 'openai::default') } as unknown as PreferenceService,
      { purgeForEntitiesTx: jest.fn() } as unknown as PinService,
    );

    await expect(service.delete('openai::default')).resolves.toBe(false);
    expect(dbService.withWriteTx).not.toHaveBeenCalled();
  });

  test('leaves pins alone when the model was already gone', async () => {
    const tx = {
      delete: jest.fn(() => ({
        where: jest.fn(() => ({ returning: jest.fn(async () => []) })),
      })),
    };
    const pinService = { purgeForEntitiesTx: jest.fn() } as unknown as PinService;
    const service = new ModelService(
      { withWriteTx: jest.fn(async (callback) => callback(tx)) } as unknown as DbService,
      { get: jest.fn(async () => null) } as unknown as PreferenceService,
      pinService,
    );

    await expect(service.delete('openai::missing')).resolves.toBe(false);
    expect(pinService.purgeForEntitiesTx).not.toHaveBeenCalled();
  });
});

function createService(dbService: DbService) {
  return new ModelService(
    dbService,
    { get: jest.fn(async () => null) } as unknown as PreferenceService,
    { purgeForEntitiesTx: jest.fn(async () => undefined) } as unknown as PinService,
  );
}
