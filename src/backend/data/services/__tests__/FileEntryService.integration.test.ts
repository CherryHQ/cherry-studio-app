import { ContentHashSchema } from '@cherrystudio/universal/data/types/file';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';

import { createServiceTestDatabase } from '../../serviceTestDatabase';
import { FileEntryService } from '../FileEntryService';

jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  v7: jest.fn(() => '00000000-0000-7000-8000-000000000000'),
}));

const HOUR = 60 * 60 * 1000;
const id = (suffix: number) => `00000000-0000-7000-8000-${suffix.toString().padStart(12, '0')}`;

describe('FileEntryService integration', () => {
  const now = 10 * HOUR;
  let testDatabase: ReturnType<typeof createServiceTestDatabase>;
  let service: FileEntryService;

  beforeEach(async () => {
    jest.spyOn(Date, 'now').mockReturnValue(now);
    testDatabase = createServiceTestDatabase();
    await installTestHost({ DbService: testDatabase.dbService });
    service = new FileEntryService();
  });

  afterEach(async () => {
    await uninstallTestHost();
    testDatabase.sqlite.close();
    jest.restoreAllMocks();
  });

  it('supports hash lookup, cursor pagination, statistics, and ID snapshots', async () => {
    insertInternal(testDatabase.sqlite, id(1), 'beta', 'txt', 'manual', 1, null, 'sha256:aaaa');
    insertInternal(testDatabase.sqlite, id(2), 'alpha', 'png', 'manual', 2, null, 'sha256:aaaa');
    insertExternal(testDatabase.sqlite, id(3), 'gamma', '/tmp/gamma', 3);
    insertInternal(testDatabase.sqlite, id(4), 'trashed', 'txt', 'manual', 4, 5, null);

    await expect(
      service.findInternalByContentHash(ContentHashSchema.parse('sha256:aaaa')),
    ).resolves.toEqual([
      expect.objectContaining({ id: id(1) }),
      expect.objectContaining({ id: id(2) }),
    ]);

    const first = await service.listCursor({ limit: 2, sortBy: 'name' });
    const second = await service.listCursor({
      cursor: first.nextCursor,
      limit: 2,
      sortBy: 'name',
    });
    expect(first.items.map((entry) => entry.name)).toEqual(['alpha', 'beta']);
    expect(first.total).toBe(3);
    expect(second.items.map((entry) => entry.name)).toEqual(['gamma']);
    expect(second.nextCursor).toBeUndefined();

    await expect(service.getStats()).resolves.toEqual({
      activeTotal: 3,
      extCounts: expect.arrayContaining([
        { count: 1, ext: null },
        { count: 1, ext: 'png' },
        { count: 1, ext: 'txt' },
      ]),
      trashTotal: 1,
    });
    await expect(service.listAllIds()).resolves.toEqual(new Set([id(1), id(2), id(3), id(4)]));
  });

  it('creates, updates, and deletes both entry variants with safe policy transitions', async () => {
    const internal = await service.create({
      cleanupPolicy: 'delete_when_unreferenced',
      contentHash: null,
      ext: 'bin',
      id: id(10),
      name: 'binary',
      origin: 'internal',
      size: 8,
    });
    expect(internal).toEqual(
      expect.objectContaining({ cleanupPolicy: 'delete_when_unreferenced', id: id(10) }),
    );
    await expect(
      service.update(id(10), { cleanupPolicy: 'manual', name: 'kept' }),
    ).resolves.toEqual(expect.objectContaining({ cleanupPolicy: 'manual', name: 'kept' }));
    await expect(
      service.update(id(10), { cleanupPolicy: 'delete_when_unreferenced' }),
    ).rejects.toMatchObject({ code: 'INVALID_OPERATION' });

    const external = await service.create({
      cleanupPolicy: 'manual',
      ext: 'txt',
      externalPath: '/tmp/external.txt',
      name: 'external',
      origin: 'external',
    });
    expect(external).toEqual(
      expect.objectContaining({
        cleanupPolicy: 'manual',
        externalPath: '/tmp/external.txt',
        origin: 'external',
      }),
    );
    await service.delete(external.id);
    await expect(service.findById(external.id)).resolves.toBeNull();
  });

  it('separates manual orphan reporting from bounded, grace-gated cleanup candidates', async () => {
    insertInternal(testDatabase.sqlite, id(20), 'manual', 'txt', 'manual', 1, null, null);
    insertInternal(
      testDatabase.sqlite,
      id(21),
      'old-auto',
      'txt',
      'delete_when_unreferenced',
      1,
      null,
      null,
    );
    insertInternal(
      testDatabase.sqlite,
      id(22),
      'young-auto',
      'txt',
      'delete_when_unreferenced',
      now - HOUR + 1,
      null,
      null,
    );

    await expect(service.findManualUnreferenced()).resolves.toEqual([
      expect.objectContaining({ id: id(20) }),
    ]);
    await expect(service.findCleanupCandidates({ graceMs: HOUR, limit: 100 })).resolves.toEqual([
      expect.objectContaining({ id: id(21) }),
    ]);

    for (let index = 0; index < 105; index++) {
      insertInternal(
        testDatabase.sqlite,
        id(1000 + index),
        `auto-${index}`,
        'txt',
        'delete_when_unreferenced',
        index + 2,
        null,
        null,
      );
    }
    await expect(
      service.findCleanupCandidates({ graceMs: HOUR, limit: 100 }),
    ).resolves.toHaveLength(100);
  });
});

function insertInternal(
  database: ReturnType<typeof createServiceTestDatabase>['sqlite'],
  entryId: string,
  name: string,
  ext: string | null,
  cleanupPolicy: 'manual' | 'delete_when_unreferenced',
  createdAt: number,
  deletedAt: number | null,
  contentHash: string | null,
): void {
  database
    .prepare(
      `INSERT INTO file_entry
       (id, origin, name, ext, size, content_hash, external_path, cleanup_policy,
        created_at, updated_at, deleted_at)
       VALUES (?, 'internal', ?, ?, 1, ?, NULL, ?, ?, ?, ?)`,
    )
    .run(entryId, name, ext, contentHash, cleanupPolicy, createdAt, createdAt, deletedAt);
}

function insertExternal(
  database: ReturnType<typeof createServiceTestDatabase>['sqlite'],
  entryId: string,
  name: string,
  externalPath: string,
  createdAt: number,
): void {
  database
    .prepare(
      `INSERT INTO file_entry
       (id, origin, name, ext, size, content_hash, external_path, cleanup_policy,
        created_at, updated_at, deleted_at)
       VALUES (?, 'external', ?, NULL, NULL, NULL, ?, 'manual', ?, ?, NULL)`,
    )
    .run(entryId, name, externalPath, createdAt, createdAt);
}
