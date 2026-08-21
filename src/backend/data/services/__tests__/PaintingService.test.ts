import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { drizzle } from 'drizzle-orm/sqlite-proxy';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import type { Database, DbService } from '@/backend/data/db/DbService';
import { schema } from '@/backend/data/db/schemas';
import type { FileEntryId } from '@/shared/data/types/file';
import type { PaintingFiles } from '@/shared/data/types/painting';

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
    insertPainting(sqlite, 'painting-new', 'a0', 3, { input: [], output: ['new-output'] });
    insertPainting(sqlite, 'painting-pending', 'a1', 2, { input: ['pending-input'], output: [] });
    insertPainting(sqlite, 'painting-old', 'a2', 1, {
      input: ['old-input'],
      output: ['old-output'],
    });

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
    insertPainting(sqlite, 'painting-original', 'a0', 1, {
      input: [],
      output: ['original-output'],
    });
    insertPainting(sqlite, 'painting-regenerated', 'Zz', 2, {
      input: ['regenerated-input'],
      output: [],
    });
    const regeneratedFileId = '00000000-0000-7000-8000-000000000002';
    insertFile(sqlite, regeneratedFileId, 2);

    const regenerated = await service.replaceOutputs('painting-regenerated', [regeneratedFileId]);

    await expect(service.getById('painting-original')).resolves.toEqual(
      expect.objectContaining({ files: { input: [], output: ['original-output'] } }),
    );
    // Only `output` is rewritten; the inputs the attempt started from survive.
    expect(regenerated.files).toEqual({
      input: ['regenerated-input'],
      output: [regeneratedFileId],
    });
  });

  it('refuses to attach an output whose file entry does not exist', async () => {
    insertPainting(sqlite, 'painting-pending', 'a0', 1);

    await expect(
      service.replaceOutputs('painting-pending', ['never-stored' as FileEntryId]),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(readPaintingFiles(sqlite, 'painting-pending')).toEqual({ input: [], output: [] });
  });

  it('keeps a receipt pointing at a file entry that was deleted', async () => {
    insertPainting(sqlite, 'painting-orphaned', 'a0', 1, {
      input: ['kept-input'],
      output: ['removed-output'],
    });
    insertFile(sqlite, 'kept-input', 1);
    insertFile(sqlite, 'removed-output', 1);

    sqlite.prepare('DELETE FROM file_entry WHERE id = ?').run('removed-output');

    // The receipt is frozen: losing the bytes must not rewrite it, so the
    // gallery still has a slot to render the unavailable placeholder in.
    await expect(service.getById('painting-orphaned')).resolves.toMatchObject({
      files: { input: ['kept-input'], output: ['removed-output'] },
    });
  });

  it('deletes a painting without touching its files', async () => {
    insertPainting(sqlite, 'painting-delete', 'a0', 1, { input: [], output: ['delete-output'] });
    insertFile(sqlite, 'delete-output', 1);

    await service.delete('painting-delete');

    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM painting').get()).toEqual({ count: 0 });
    expect(sqlite.prepare('SELECT id FROM file_entry').all()).toEqual([{ id: 'delete-output' }]);
  });

  it('reports a missing painting when delete returns no row', async () => {
    await expect(service.delete('missing-painting')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('deletes multiple paintings and ignores duplicate ids', async () => {
    insertPainting(sqlite, 'painting-a', 'a0', 1, { input: [], output: ['a-output'] });
    insertPainting(sqlite, 'painting-b', 'a1', 2, { input: [], output: ['b-output'] });
    insertPainting(sqlite, 'painting-kept', 'a2', 3, { input: [], output: ['kept-output'] });

    await service.deleteMany(['painting-a', 'painting-b', 'painting-a']);

    expect(sqlite.prepare('SELECT id FROM painting').all()).toEqual([{ id: 'painting-kept' }]);
    expect(readPaintingFiles(sqlite, 'painting-kept')).toEqual({
      input: [],
      output: ['kept-output'],
    });
  });

  it('rolls back the batch when any selected painting is missing', async () => {
    insertPainting(sqlite, 'painting-existing', 'a0', 1, {
      input: [],
      output: ['existing-output'],
    });

    await expect(
      service.deleteMany(['painting-existing', 'missing-painting']),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(readPaintingFiles(sqlite, 'painting-existing')).toEqual({
      input: [],
      output: ['existing-output'],
    });
  });

  it('does nothing when deleteMany receives no ids', async () => {
    insertPainting(sqlite, 'painting-kept', 'a0', 1);

    await service.deleteMany([]);

    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM painting').get()).toEqual({ count: 1 });
  });

  it('lists every painting id in gallery order so select-all matches what is on screen', async () => {
    insertPainting(sqlite, 'painting-first', 'a0', 3, { input: [], output: ['first-output'] });
    insertPainting(sqlite, 'painting-pending', 'a1', 2, { input: ['pending-input'], output: [] });
    insertPainting(sqlite, 'painting-last', 'a2', 1, { input: [], output: ['last-output'] });

    await expect(service.listAllIds()).resolves.toEqual([
      'painting-first',
      'painting-pending',
      'painting-last',
    ]);
  });

  it('reuses an interrupted receipt: keeps its id, swaps inputs, moves it to the head', async () => {
    insertPainting(sqlite, 'painting-retry', 'a5', 1, { input: ['stale-input'], output: [] });
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
    expect(readPaintingFiles(sqlite, 'painting-retry')).toEqual({
      input: ['fresh-input'],
      output: [],
    });
  });

  it('refuses to reuse a receipt that already holds outputs', async () => {
    insertPainting(sqlite, 'painting-done', 'a0', 1, { input: [], output: ['done-output'] });

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

function insertPainting(
  database: DatabaseSync,
  id: string,
  orderKey: string,
  timestamp: number,
  files: PaintingFiles = { input: [], output: [] },
) {
  database
    .prepare(
      `INSERT INTO painting
       (id, provider_id, model_id, prompt, order_key, created_at, updated_at, files)
       VALUES (?, 'provider', 'provider::model', 'prompt', ?, ?, ?, ?)`,
    )
    .run(id, orderKey, timestamp, timestamp, JSON.stringify(files));
}

/**
 * Reads the receipt straight from SQLite so the assertion sees the stored JSON
 * rather than whatever the service hands back.
 */
function readPaintingFiles(database: DatabaseSync, id: string): PaintingFiles | undefined {
  const row = database.prepare('SELECT files FROM painting WHERE id = ?').get(id) as
    | { files: string }
    | undefined;
  return row ? (JSON.parse(row.files) as PaintingFiles) : undefined;
}

/**
 * A painting's `files` column is not foreign-keyed, so entries only need to
 * exist where the service checks them at write time.
 */
function insertFile(database: DatabaseSync, fileId: string, timestamp: number) {
  database
    .prepare(
      `INSERT INTO file_entry
       (id, filename, media_type, size, created_at, updated_at, deleted_at)
       VALUES (?, ?, 'image/png', 4, ?, ?, NULL)`,
    )
    .run(fileId, `${fileId}.png`, timestamp, timestamp);
}
