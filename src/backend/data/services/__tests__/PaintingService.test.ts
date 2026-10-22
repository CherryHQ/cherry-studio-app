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

  it('pages boards by their latest change, each with its count and newest receipts', async () => {
    insertPainting(sqlite, 'busy-1', 'a0', 1, { input: [], output: ['busy-1-out'] }, 'board-busy');
    insertPainting(sqlite, 'busy-2', 'a1', 2, { input: [], output: [] }, 'board-busy');
    insertPainting(sqlite, 'busy-3', 'a2', 3, { input: [], output: ['busy-3-out'] }, 'board-busy');
    insertPainting(sqlite, 'busy-4', 'a3', 4, { input: [], output: ['busy-4-out'] }, 'board-busy');
    insertPainting(
      sqlite,
      'busy-5',
      'a6',
      7,
      { input: [], output: ['busy-5-a', 'busy-5-b'] },
      'board-busy',
    );
    insertPainting(sqlite, 'quiet-1', 'a4', 5, { input: [], output: ['quiet-out'] }, 'board-quiet');
    insertPainting(sqlite, 'old-1', 'a5', 6, { input: [], output: [] }, 'board-old');
    touchBoard(sqlite, 'board-busy', 30);
    touchBoard(sqlite, 'board-quiet', 20);
    touchBoard(sqlite, 'board-old', 10);

    const firstPage = await service.listBoardsByCursor({ limit: 2 });
    const secondPage = await service.listBoardsByCursor({
      cursor: firstPage.nextCursor,
      limit: 2,
    });

    expect(firstPage.items.map((summary) => summary.board.id)).toEqual([
      'board-busy',
      'board-quiet',
    ]);
    expect(firstPage.items[0]).toMatchObject({ imageCount: 5, paintingCount: 5 });
    expect(firstPage.items[0].recentPaintings.map(({ id }) => id)).toEqual([
      'busy-5',
      'busy-4',
      'busy-3',
      'busy-2',
    ]);
    expect(firstPage.items[0].recentPaintings[3].files).toEqual({ input: [], output: [] });
    expect(firstPage.items[1]).toMatchObject({ imageCount: 1, paintingCount: 1 });
    expect(secondPage.items[0]).toMatchObject({ imageCount: 0, paintingCount: 1 });
    expect(secondPage.items.map((summary) => summary.board.id)).toEqual(['board-old']);
    expect(secondPage.nextCursor).toBeUndefined();
  });

  it('rejects a malformed board cursor', async () => {
    await expect(service.listBoardsByCursor({ cursor: 'not-json' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
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

  it('rejects an expired attempt after the receipt has been reused', async () => {
    insertPainting(sqlite, 'painting-retry', 'a0', 1);
    insertFile(sqlite, 'stale-output', 1);
    await service.resetForRetryTx(database, 'painting-retry', {
      inputFileIds: [],
      modelId: 'model-2',
      prompt: 'new prompt',
      providerId: 'provider',
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      service.replaceOutputs('painting-retry', ['stale-output' as FileEntryId], controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    await expect(service.getById('painting-retry')).resolves.toMatchObject({
      prompt: 'new prompt',
      files: { input: [], output: [] },
    });
  });

  it('rolls back output references when cancellation arrives during the database update', async () => {
    insertPainting(sqlite, 'painting-pending', 'a0', 1);
    insertFile(sqlite, 'late-output', 1);
    const controller = new AbortController();
    const update = database.update.bind(database);
    const spy = jest.spyOn(database, 'update').mockImplementationOnce((...args) => {
      controller.abort();
      return update(...args);
    });
    try {
      await expect(
        service.replaceOutputs(
          'painting-pending',
          ['late-output' as FileEntryId],
          controller.signal,
        ),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(readPaintingFiles(sqlite, 'painting-pending')).toEqual({ input: [], output: [] });
    } finally {
      spy.mockRestore();
    }
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

  it('finds the painting that produced a file, and nothing for files it only used', async () => {
    insertPainting(sqlite, 'painting-source', 'a0', 1, { input: [], output: ['source-output'] });
    insertPainting(sqlite, 'painting-edit', 'a1', 2, {
      input: ['source-output'],
      output: ['edit-output-1', 'edit-output-2'],
    });

    await expect(service.findByOutputFile('edit-output-2')).resolves.toMatchObject({
      id: 'painting-edit',
    });
    await expect(service.findByOutputFile('source-output')).resolves.toMatchObject({
      id: 'painting-source',
    });
    await expect(service.findByOutputFile('imported-photo')).resolves.toBeNull();
  });

  it('lists only the paintings of one board, oldest first', async () => {
    insertPainting(sqlite, 'painting-late', 'a0', 3, undefined, 'board-shared');
    insertPainting(sqlite, 'painting-early', 'a1', 1, undefined, 'board-shared');
    insertPainting(sqlite, 'painting-elsewhere', 'a2', 2);

    await expect(
      service.listByBoard('board-shared').then((paintings) => paintings.map(({ id }) => id)),
    ).resolves.toEqual(['painting-early', 'painting-late']);
  });

  it('removes a board once its last painting is deleted, but keeps boards that still hold some', async () => {
    insertPainting(sqlite, 'painting-a', 'a0', 1, undefined, 'board-shared');
    insertPainting(sqlite, 'painting-b', 'a1', 2, undefined, 'board-shared');
    insertPainting(sqlite, 'painting-alone', 'a2', 3, undefined, 'board-alone');

    await service.deleteMany(['painting-a', 'painting-alone']);

    expect(boardIds(sqlite)).toEqual(['board-shared']);
    await service.deleteMany(['painting-b']);
    expect(boardIds(sqlite)).toEqual([]);
  });

  it('deletes a board with all of its paintings while leaving their files in the library', async () => {
    insertPainting(
      sqlite,
      'painting-a',
      'a0',
      1,
      { input: [], output: ['a-output'] },
      'board-gone',
    );
    insertPainting(sqlite, 'painting-b', 'a1', 2, undefined, 'board-gone');
    insertPainting(sqlite, 'painting-kept', 'a2', 3, undefined, 'board-kept');
    insertFile(sqlite, 'a-output', 1);

    await service.deleteBoard('board-gone');

    expect(sqlite.prepare('SELECT id FROM painting').all()).toEqual([{ id: 'painting-kept' }]);
    expect(sqlite.prepare('SELECT id FROM file_entry').all()).toEqual([{ id: 'a-output' }]);
    await expect(service.deleteBoard('board-gone')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('renames a board and remembers its focused painting, rejecting blank titles', async () => {
    insertPainting(sqlite, 'painting-a', 'a0', 1, undefined, 'board-1');

    await expect(
      service.updateBoard('board-1', { focusPaintingId: 'painting-a', title: '  Sunset cat  ' }),
    ).resolves.toMatchObject({ focusPaintingId: 'painting-a', id: 'board-1', title: 'Sunset cat' });
    await expect(service.updateBoard('board-1', { title: '   ' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(service.getBoard('board-1')).resolves.toMatchObject({ title: 'Sunset cat' });
    await expect(service.updateBoard('missing', { title: 'x' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
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
  boardId = `board-${id}`,
) {
  database
    .prepare(
      `INSERT OR IGNORE INTO painting_board (id, title, created_at, updated_at)
       VALUES (?, 'Board', ?, ?)`,
    )
    .run(boardId, timestamp, timestamp);
  database
    .prepare(
      `INSERT INTO painting
       (id, board_id, provider_id, model_id, prompt, order_key, created_at, updated_at, files)
       VALUES (?, ?, 'provider', 'provider::model', 'prompt', ?, ?, ?, ?)`,
    )
    .run(id, boardId, orderKey, timestamp, timestamp, JSON.stringify(files));
}

function touchBoard(database: DatabaseSync, id: string, updatedAt: number) {
  database.prepare('UPDATE painting_board SET updated_at = ? WHERE id = ?').run(updatedAt, id);
}

function boardIds(database: DatabaseSync) {
  return (
    database.prepare('SELECT id FROM painting_board ORDER BY id').all() as { id: string }[]
  ).map((row) => row.id);
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
