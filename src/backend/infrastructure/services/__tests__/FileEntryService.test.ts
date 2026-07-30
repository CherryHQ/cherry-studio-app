import type { Database, DbService } from '@/backend/infrastructure/db/DbService';
import { FileEntryService } from '../FileEntryService';

jest.mock('uuid', () => ({
  v7: jest.fn(() => '00000000-0000-7000-8000-000000000000'),
}));

jest.mock('../fileStorage', () => ({
  resolveInternalFileUri: jest.fn(() => 'file:///documents/files/entry.txt'),
}));

describe('FileEntryService', () => {
  test.each([
    [
      {
        createdAt: 1,
        deletedAt: null,
        ext: 'txt',
        externalPath: null,
        id: '00000000-0000-7000-8000-000000000001',
        name: 'brief',
        origin: 'internal',
        size: 12,
        updatedAt: 2,
      },
      {
        createdAt: 1,
        ext: 'txt',
        id: '00000000-0000-7000-8000-000000000001',
        name: 'brief',
        origin: 'internal',
        size: 12,
        updatedAt: 2,
      },
    ],
    [
      {
        createdAt: 1,
        deletedAt: null,
        ext: null,
        externalPath: '/tmp/brief',
        id: '00000000-0000-7000-8000-000000000002',
        name: 'brief',
        origin: 'external',
        size: null,
        updatedAt: 2,
      },
      {
        createdAt: 1,
        ext: null,
        externalPath: '/tmp/brief',
        id: '00000000-0000-7000-8000-000000000002',
        name: 'brief',
        origin: 'external',
        updatedAt: 2,
      },
    ],
  ])('maps %s database rows to file entries', async (row, expected) => {
    const service = createServiceWithRows([row]);

    await expect(service.findById(row.id)).resolves.toEqual(expected);
  });

  test('inserts prepared entries into the caller transaction', async () => {
    const values = jest.fn(async () => undefined);
    const tx = { insert: jest.fn(() => ({ values })) } as unknown as Database;
    const service = new FileEntryService({} as DbService);

    await service.createPreparedEntriesTx(tx, [
      {
        ext: 'txt',
        id: '00000000-0000-7000-8000-000000000001',
        name: 'brief',
        size: 12,
        uri: 'file:///documents/files/entry.txt',
      },
    ]);

    expect(values).toHaveBeenCalledWith([
      {
        ext: 'txt',
        id: '00000000-0000-7000-8000-000000000001',
        name: 'brief',
        origin: 'internal',
        size: 12,
      },
    ]);
  });
});

function createServiceWithRows(rows: unknown[]) {
  const db = {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({ limit: jest.fn(async () => rows) })),
      })),
    })),
  };
  return new FileEntryService({ getDb: () => db } as unknown as DbService);
}
