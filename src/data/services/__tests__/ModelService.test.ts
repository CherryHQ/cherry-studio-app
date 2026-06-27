import type { DbService } from '@/data/db/DbService';
import { userModelTable } from '@/data/db/schemas/userModel';
import { ModelService } from '../ModelService';

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
