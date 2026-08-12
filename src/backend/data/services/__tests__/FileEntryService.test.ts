import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import type { DbService } from '@/backend/data/db/DbService';

import { FileEntryService } from '../FileEntryService';

jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  v7: jest.fn(() => '00000000-0000-7000-8000-000000000000'),
}));

afterEach(uninstallTestHost);

describe('FileEntryService', () => {
  test.each([
    [
      {
        cleanupPolicy: 'manual',
        contentHash: null,
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
        cleanupPolicy: 'manual',
        contentHash: null,
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
        cleanupPolicy: 'manual',
        contentHash: null,
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
        cleanupPolicy: 'manual',
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
    const service = await createServiceWithRows([row]);

    await expect(service.findById(row.id)).resolves.toEqual(expected);
  });
});

async function createServiceWithRows(rows: unknown[]) {
  const db = {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({ limit: jest.fn(async () => rows) })),
      })),
    })),
  };
  return installTestHost({ DbService: { getDb: () => db } as unknown as DbService }).then(
    () => new FileEntryService(),
  );
}
