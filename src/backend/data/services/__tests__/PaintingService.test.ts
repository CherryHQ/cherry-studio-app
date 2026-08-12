import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import type { FileEntryId } from '@cherrystudio/universal/data/types/file';
import { drizzle } from 'drizzle-orm/sqlite-proxy';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import type { Database, DbService } from '@/backend/data/db/DbService';
import { schema } from '@/backend/data/db/schemas';

import { PaintingService } from '../PaintingService';

jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000001'),
  v7: jest.fn(() => '00000000-0000-7000-8000-000000000001'),
}));

jest.mock('../utils/orderKey', () => ({
  computeNewOrderKey: jest.fn(async () => 'Zz'),
  insertWithOrderKey: jest.fn(),
}));

type MigrationJournal = { entries: { tag: string }[] };

describe('PaintingService integration', () => {
  let sqlite: DatabaseSync;
  let service: PaintingService;
  let database: Database;

  beforeEach(async () => {
    sqlite = new DatabaseSync(':memory:');
    sqlite.exec('PRAGMA foreign_keys = ON');
    applyMigrations(sqlite);
    database = drizzle(
      async (sql, params, method) => {
        const statement = sqlite.prepare(sql);
        if (method === 'run') {
          statement.run(...params);
          return { rows: [] };
        }
        if (method === 'get') {
          const row = statement.get(...params) as Record<string, unknown> | undefined;
          return { rows: row ? Object.values(row) : [] };
        }
        const rows = statement.all(...params) as Record<string, unknown>[];
        return { rows: rows.map((row) => Object.values(row)) };
      },
      undefined as never,
      { casing: 'snake_case', schema },
    ) as unknown as Database;
    const dbService = {
      getDb: () => database,
      withWriteTx: async <T>(callback: (tx: Database) => Promise<T>) => {
        sqlite.exec('BEGIN IMMEDIATE');
        try {
          const result = await callback(database);
          sqlite.exec('COMMIT');
          return result;
        } catch (error) {
          sqlite.exec('ROLLBACK');
          throw error;
        }
      },
    } as unknown as DbService;
    // Data services resolve `DbService` from `application`, so the fake is
    // installed as a host override instead of being passed to constructors.
    await installTestHost({ DbService: dbService });
    service = new PaintingService();
  });

  afterEach(async () => {
    await uninstallTestHost();
    sqlite.close();
  });

  it('pages newest receipts first and keeps output-less ones so the gallery can show them', async () => {
    insertPainting(sqlite, 'painting-new', 'a0', 3);
    insertPainting(sqlite, 'painting-pending', 'a1', 2);
    insertPainting(sqlite, 'painting-old', 'a2', 1);
    insertFileAndRef(sqlite, 'new-output', 'painting-new', 'output', 3);
    insertFileAndRef(sqlite, 'pending-input', 'painting-pending', 'input', 2);
    insertFileAndRef(sqlite, 'old-input', 'painting-old', 'input', 1);
    insertFileAndRef(sqlite, 'old-output', 'painting-old', 'output', 1);

    const firstPage = await service.listByCursor({ limit: 2 });
    const secondPage = await service.listByCursor({ cursor: firstPage.nextCursor, limit: 2 });

    expect(firstPage.items.map((painting) => painting.id)).toEqual([
      'painting-new',
      'painting-pending',
    ]);
    expect(firstPage.items[1].files).toEqual({ input: ['pending-input'], output: [] });
    expect(firstPage.nextCursor).toBeDefined();
    expect(secondPage.items.map((painting) => painting.id)).toEqual(['painting-old']);
    expect(secondPage.items[0].files).toEqual({ input: ['old-input'], output: ['old-output'] });
    expect(secondPage.nextCursor).toBeUndefined();
  });

  it('attaches generated outputs atomically without changing the original receipt', async () => {
    insertPainting(sqlite, 'painting-original', 'a0', 1);
    insertPainting(sqlite, 'painting-regenerated', 'Zz', 2);
    insertFileAndRef(sqlite, 'original-output', 'painting-original', 'output', 1);
    const regeneratedFileId = '00000000-0000-7000-8000-000000000002';
    insertFile(sqlite, regeneratedFileId, 2);

    const regenerated = await service.replaceOutputs('painting-regenerated', [regeneratedFileId]);

    await expect(service.getById('painting-original')).resolves.toEqual(
      expect.objectContaining({ files: { input: [], output: ['original-output'] } }),
    );
    expect(regenerated.files.output).toEqual(['00000000-0000-7000-8000-000000000002']);
  });

  it('deletes a painting and its file relationships', async () => {
    insertPainting(sqlite, 'painting-delete', 'a0', 1);
    insertFileAndRef(sqlite, 'delete-output', 'painting-delete', 'output', 1);

    await service.delete('painting-delete');

    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM painting').get()).toEqual({ count: 0 });
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM painting_file_ref').get()).toEqual({
      count: 0,
    });
  });

  it('reports a missing painting when delete returns no row', async () => {
    await expect(service.delete('missing-painting')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('deletes multiple paintings with their file relationships and ignores duplicate ids', async () => {
    insertPainting(sqlite, 'painting-a', 'a0', 1);
    insertPainting(sqlite, 'painting-b', 'a1', 2);
    insertPainting(sqlite, 'painting-kept', 'a2', 3);
    insertFileAndRef(sqlite, 'a-output', 'painting-a', 'output', 1);
    insertFileAndRef(sqlite, 'b-output', 'painting-b', 'output', 2);
    insertFileAndRef(sqlite, 'kept-output', 'painting-kept', 'output', 3);

    await service.deleteMany(['painting-a', 'painting-b', 'painting-a']);

    expect(sqlite.prepare('SELECT id FROM painting').all()).toEqual([{ id: 'painting-kept' }]);
    expect(sqlite.prepare('SELECT file_entry_id FROM painting_file_ref').all()).toEqual([
      { file_entry_id: 'kept-output' },
    ]);
  });

  it('rolls back the batch when any selected painting is missing', async () => {
    insertPainting(sqlite, 'painting-existing', 'a0', 1);
    insertFileAndRef(sqlite, 'existing-output', 'painting-existing', 'output', 1);

    await expect(
      service.deleteMany(['painting-existing', 'missing-painting']),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM painting').get()).toEqual({ count: 1 });
  });

  it('does nothing when deleteMany receives no ids', async () => {
    insertPainting(sqlite, 'painting-kept', 'a0', 1);

    await service.deleteMany([]);

    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM painting').get()).toEqual({ count: 1 });
  });

  it('lists every painting id in gallery order so select-all matches what is on screen', async () => {
    insertPainting(sqlite, 'painting-first', 'a0', 3);
    insertPainting(sqlite, 'painting-pending', 'a1', 2);
    insertPainting(sqlite, 'painting-last', 'a2', 1);
    insertFileAndRef(sqlite, 'first-output', 'painting-first', 'output', 3);
    insertFileAndRef(sqlite, 'pending-input', 'painting-pending', 'input', 2);
    insertFileAndRef(sqlite, 'last-output', 'painting-last', 'output', 1);

    await expect(service.listAllIds()).resolves.toEqual([
      'painting-first',
      'painting-pending',
      'painting-last',
    ]);
  });

  it('reuses an interrupted receipt: keeps its id, swaps inputs, moves it to the head', async () => {
    insertPainting(sqlite, 'painting-retry', 'a5', 1);
    insertFileAndRef(sqlite, 'stale-input', 'painting-retry', 'input', 1);
    insertFile(sqlite, 'fresh-input', 2);

    const retried = await service.resetForRetryTx(database, 'painting-retry', {
      inputFileIds: ['fresh-input' as FileEntryId],
      modelId: 'model-2',
      prompt: 'retry prompt',
      providerId: 'provider',
    });

    expect(retried).toMatchObject({
      files: { input: ['fresh-input'], output: [] },
      id: 'painting-retry',
      modelId: 'provider::model-2',
      orderKey: 'Zz',
      prompt: 'retry prompt',
    });
    expect(sqlite.prepare('SELECT file_entry_id FROM painting_file_ref').all()).toEqual([
      { file_entry_id: 'fresh-input' },
    ]);
  });

  it('refuses to reuse a receipt that already holds outputs', async () => {
    insertPainting(sqlite, 'painting-done', 'a0', 1);
    insertFileAndRef(sqlite, 'done-output', 'painting-done', 'output', 1);

    await expect(
      service.resetForRetryTx(database, 'painting-done', {
        inputFileIds: [],
        modelId: 'model-2',
        prompt: 'retry prompt',
        providerId: 'provider',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

function applyMigrations(database: DatabaseSync) {
  const directory = `${process.cwd()}/migrations/sqlite-drizzle`;
  const journal = JSON.parse(
    readFileSync(`${directory}/meta/_journal.json`, 'utf8'),
  ) as MigrationJournal;
  for (const { tag } of journal.entries) {
    const migration = readFileSync(`${directory}/${tag}.sql`, 'utf8');
    for (const statement of migration.split('--> statement-breakpoint')) {
      if (statement.trim()) {
        database.exec(statement);
      }
    }
  }
}

function insertPainting(database: DatabaseSync, id: string, orderKey: string, timestamp: number) {
  database
    .prepare(
      `INSERT INTO painting
       (id, provider_id, model_id, prompt, order_key, created_at, updated_at)
       VALUES (?, 'provider', 'provider::model', 'prompt', ?, ?, ?)`,
    )
    .run(id, orderKey, timestamp, timestamp);
}

function insertFileAndRef(
  database: DatabaseSync,
  fileId: string,
  paintingId: string,
  role: 'input' | 'output',
  timestamp: number,
) {
  insertFile(database, fileId, timestamp);
  database
    .prepare(
      `INSERT INTO painting_file_ref
       (id, file_entry_id, source_id, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(`ref-${fileId}`, fileId, paintingId, role, timestamp, timestamp);
}

function insertFile(database: DatabaseSync, fileId: string, timestamp: number) {
  database
    .prepare(
      `INSERT INTO file_entry
       (id, origin, name, ext, size, external_path, created_at, updated_at, deleted_at)
       VALUES (?, 'internal', ?, 'png', 4, NULL, ?, ?, NULL)`,
    )
    .run(fileId, fileId, timestamp, timestamp);
}
