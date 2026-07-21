import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';

import type { Database, DbService } from '@/data/db/DbService';
import { schema } from '@/data/db/schemas';
import { FileEntryService } from '../FileEntryService';
import { PaintingService } from '../PaintingService';

jest.mock('uuid', () => ({
  v7: jest.fn(() => '00000000-0000-7000-8000-000000000001'),
}));

jest.mock('../utils/orderKey', () => ({
  insertWithOrderKey: jest.fn(),
}));

type MigrationJournal = { entries: { tag: string }[] };

describe('PaintingService integration', () => {
  let sqlite: DatabaseSync;
  let service: PaintingService;

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:');
    sqlite.exec('PRAGMA foreign_keys = ON');
    applyMigrations(sqlite);
    const database = drizzle(
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
    service = new PaintingService(dbService, new FileEntryService(dbService));
  });

  afterEach(() => sqlite.close());

  it('pages newest output receipts first and filters receipts without outputs', async () => {
    insertPainting(sqlite, 'painting-new', 'a0', 3);
    insertPainting(sqlite, 'painting-empty', 'a1', 2);
    insertPainting(sqlite, 'painting-old', 'a2', 1);
    insertFileAndRef(sqlite, 'new-output', 'painting-new', 'output', 3);
    insertFileAndRef(sqlite, 'old-input', 'painting-old', 'input', 1);
    insertFileAndRef(sqlite, 'old-output', 'painting-old', 'output', 1);

    const firstPage = await service.listByCursor({ limit: 1 });
    const secondPage = await service.listByCursor({ cursor: firstPage.nextCursor, limit: 1 });

    expect(firstPage.items.map((painting) => painting.id)).toEqual(['painting-new']);
    expect(firstPage.nextCursor).toBeDefined();
    expect(secondPage.items.map((painting) => painting.id)).toEqual(['painting-old']);
    expect(secondPage.items[0].files).toEqual({ input: ['old-input'], output: ['old-output'] });
    expect(secondPage.nextCursor).toBeUndefined();
  });

  it('attaches generated outputs atomically without changing the original receipt', async () => {
    insertPainting(sqlite, 'painting-original', 'a0', 1);
    insertPainting(sqlite, 'painting-regenerated', 'Zz', 2);
    insertFileAndRef(sqlite, 'original-output', 'painting-original', 'output', 1);

    const regenerated = await service.replaceOutputs('painting-regenerated', [
      {
        ext: 'png',
        id: '00000000-0000-7000-8000-000000000002',
        name: 'regenerated',
        size: 4,
        uri: 'file:///documents/files/regenerated.png',
      },
    ]);

    await expect(service.getById('painting-original')).resolves.toEqual(
      expect.objectContaining({ files: { input: [], output: ['original-output'] } }),
    );
    expect(regenerated.files.output).toEqual(['00000000-0000-7000-8000-000000000002']);
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
  database
    .prepare(
      `INSERT INTO file_entry
       (id, origin, name, ext, size, external_path, created_at, updated_at, deleted_at)
       VALUES (?, 'internal', ?, 'png', 4, NULL, ?, ?, NULL)`,
    )
    .run(fileId, fileId, timestamp, timestamp);
  database
    .prepare(
      `INSERT INTO painting_file_ref
       (id, file_entry_id, source_id, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(`ref-${fileId}`, fileId, paintingId, role, timestamp, timestamp);
}
