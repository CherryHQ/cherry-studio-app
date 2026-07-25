import { randomUUID as mockRandomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';

import type { Database, DbService } from '@/data/db/DbService';
import { schema } from '@/data/db/schemas';
import { McpServerService } from '../McpServerService';

// Rows are inserted in bulk here, so unlike the fixed-id mocks elsewhere these
// have to be distinct. `expo-crypto` is already mocked the same way globally.
jest.mock('uuid', () => ({ v7: mockRandomUUID }));

type MigrationJournal = { entries: { tag: string }[] };

describe('McpServerService integration', () => {
  let sqlite: DatabaseSync;
  let service: McpServerService;
  let dbService: DbService;

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
    dbService = {
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
    service = new McpServerService(dbService);
  });

  afterEach(() => sqlite.close());

  it('creates a server with defaulted json/boolean fields', async () => {
    const server = await service.create({ baseUrl: 'https://example.com/mcp', name: 'Example' });

    expect(server).toMatchObject({
      baseUrl: 'https://example.com/mcp',
      description: '',
      disabledAutoApproveTools: [],
      disabledTools: [],
      headers: {},
      isActive: true,
      name: 'Example',
      timeout: null,
    });
  });

  it('rejects duplicate names on create and update', async () => {
    await service.create({ baseUrl: 'https://a.example/mcp', name: 'Dup' });
    await expect(
      service.create({ baseUrl: 'https://b.example/mcp', name: 'Dup' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const other = await service.create({ baseUrl: 'https://c.example/mcp', name: 'Other' });
    await expect(service.update(other.id, { name: 'Dup' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('allows updating a server to its own name', async () => {
    const server = await service.create({ baseUrl: 'https://a.example/mcp', name: 'Same' });
    const updated = await service.update(server.id, { name: 'Same', timeout: 30 });
    expect(updated.timeout).toBe(30);
  });

  it('filters by isActive', async () => {
    await service.create({ baseUrl: 'https://a.example/mcp', isActive: true, name: 'Active' });
    await service.create({ baseUrl: 'https://b.example/mcp', isActive: false, name: 'Inactive' });

    const active = await service.list({ isActive: true });
    expect(active.items.map((s) => s.name)).toEqual(['Active']);
    const all = await service.list();
    expect(all.total).toBe(2);
  });

  it('deletes a server and cascades its assistant junction rows', async () => {
    const server = await service.create({ baseUrl: 'https://a.example/mcp', name: 'Linked' });
    insertAssistant(sqlite, 'assistant-1');
    await dbService.withWriteTx((tx) =>
      service.syncAssistantServersTx(tx, 'assistant-1', [server.id]),
    );
    expect(countJunction(sqlite)).toBe(1);

    await service.delete(server.id);

    expect(countJunction(sqlite)).toBe(0);
    await expect(service.getById(server.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('syncs assistant associations as a diff', async () => {
    const a = await service.create({ baseUrl: 'https://a.example/mcp', name: 'A' });
    const b = await service.create({ baseUrl: 'https://b.example/mcp', name: 'B' });
    const c = await service.create({ baseUrl: 'https://c.example/mcp', name: 'C' });
    insertAssistant(sqlite, 'assistant-1');

    await dbService.withWriteTx((tx) =>
      service.syncAssistantServersTx(tx, 'assistant-1', [a.id, b.id]),
    );
    expect(junctionServerIds(sqlite)).toEqual([a.id, b.id].sort());

    await dbService.withWriteTx((tx) =>
      service.syncAssistantServersTx(tx, 'assistant-1', [b.id, c.id]),
    );
    expect(junctionServerIds(sqlite)).toEqual([b.id, c.id].sort());

    await dbService.withWriteTx((tx) => service.syncAssistantServersTx(tx, 'assistant-1', []));
    expect(countJunction(sqlite)).toBe(0);
  });

  it('rejects syncing unknown server ids', async () => {
    insertAssistant(sqlite, 'assistant-1');
    await expect(
      dbService.withWriteTx((tx) =>
        service.syncAssistantServersTx(tx, 'assistant-1', ['missing-server']),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
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

function insertAssistant(database: DatabaseSync, id: string) {
  database
    .prepare(
      `INSERT INTO assistant (id, name, emoji, settings, order_key, created_at, updated_at)
       VALUES (?, 'Assistant', 'x', '{}', 'a0', 1, 1)`,
    )
    .run(id);
}

function countJunction(database: DatabaseSync): number {
  return (
    database.prepare('SELECT COUNT(*) AS count FROM assistant_mcp_server').get() as {
      count: number;
    }
  ).count;
}

function junctionServerIds(database: DatabaseSync): string[] {
  return (
    database.prepare('SELECT mcp_server_id FROM assistant_mcp_server').all() as {
      mcp_server_id: string;
    }[]
  )
    .map((row) => row.mcp_server_id)
    .sort();
}
