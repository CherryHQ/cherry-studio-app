import type { DbService } from '@/backend/data/db/DbService';

import { TagService } from '../TagService';

jest.mock('@/backend/data/db/schemas', () => ({
  entityTagTable: {
    entityId: 'entityTag.entityId',
    entityType: 'entityTag.entityType',
    tagId: 'entityTag.tagId',
  },
  tagTable: {
    id: 'tag.id',
  },
}));

describe('TagService.setEntities', () => {
  function createService(options: {
    existing?: { entityId: string; entityType: string }[];
    tagExists?: boolean;
  }) {
    const deleteWhere = jest.fn(async () => undefined);
    const insertValues = jest.fn(async () => undefined);
    const tx = {
      delete: jest.fn(() => ({ where: deleteWhere })),
      insert: jest.fn(() => ({ values: insertValues })),
      select: jest
        .fn()
        .mockImplementationOnce(() => ({
          from: () => ({
            where: () => ({
              limit: async () => (options.tagExists === false ? [] : [{ id: 'tag-1' }]),
            }),
          }),
        }))
        .mockImplementationOnce(() => ({
          from: () => ({ where: async () => options.existing ?? [] }),
        })),
    };
    const dbService = {
      withWriteTx: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    } as unknown as DbService;

    return {
      deleteWhere,
      insertValues,
      service: new TagService(dbService),
      tx,
    };
  }

  test('updates associations by diff without rewriting unchanged rows', async () => {
    const { deleteWhere, insertValues, service } = createService({
      existing: [
        { entityId: 'assistant-1', entityType: 'assistant' },
        { entityId: 'topic-1', entityType: 'topic' },
      ],
    });

    await service.setEntities('tag-1', {
      entities: [
        { entityId: 'topic-1', entityType: 'topic' },
        { entityId: 'model-1', entityType: 'model' },
      ],
    });

    expect(deleteWhere).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledWith([
      { entityId: 'model-1', entityType: 'model', tagId: 'tag-1' },
    ]);
  });

  test('rejects a missing tag before changing associations', async () => {
    const { service, tx } = createService({ tagExists: false });

    await expect(service.setEntities('missing', { entities: [] })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(tx.delete).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });
});
