import { randomUUID as mockRandomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';

import type { Database, DbService } from '@/data/db/DbService';
import { schema } from '@/data/db/schemas';

import { McpServerService } from '../McpServerService';

jest.mock('uuid', () => ({ v7: mockRandomUUID }));

type MigrationJournal = { entries: { tag: string }[] };

describe('McpServerService desktop contract', () => {
  let sqlite: DatabaseSync;
  let service: McpServerService;

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
    service = new McpServerService(dbService);
  });

  afterEach(() => sqlite.close());

  it('creates and returns a complete desktop-compatible entity', async () => {
    const server = await service.create({
      args: ['server.js'],
      baseUrl: 'https://example.com/mcp',
      command: 'node',
      configSample: { args: ['server.js'], command: 'node', env: { TOKEN: 'value' } },
      description: 'Desktop metadata',
      disabledAutoApproveTools: ['write'],
      disabledTools: ['delete'],
      dxtPath: '/packages/example',
      dxtVersion: '1.2.3',
      env: { NODE_ENV: 'production' },
      headers: { Authorization: 'Bearer token' },
      installSource: 'protocol',
      installedAt: 1_700_000_000_000,
      isTrusted: true,
      logoUrl: 'https://example.com/logo.png',
      longRunning: true,
      name: 'Desktop server',
      provider: 'Desktop Provider',
      providerUrl: 'https://provider.example',
      reference: 'https://example.com/docs',
      registryUrl: 'https://registry.example',
      searchKey: 'example',
      shouldConfig: true,
      sortOrder: 7,
      tags: ['search'],
      timeout: 30,
      trustedAt: 1_700_000_000_001,
      type: 'stdio',
    });

    expect(server).toMatchObject({
      args: ['server.js'],
      baseUrl: 'https://example.com/mcp',
      command: 'node',
      configSample: { args: ['server.js'], command: 'node', env: { TOKEN: 'value' } },
      description: 'Desktop metadata',
      disabledAutoApproveTools: ['write'],
      disabledTools: ['delete'],
      dxtPath: '/packages/example',
      dxtVersion: '1.2.3',
      env: { NODE_ENV: 'production' },
      headers: { Authorization: 'Bearer token' },
      installSource: 'protocol',
      installedAt: 1_700_000_000_000,
      isActive: false,
      isTrusted: true,
      logoUrl: 'https://example.com/logo.png',
      longRunning: true,
      name: 'Desktop server',
      provider: 'Desktop Provider',
      providerUrl: 'https://provider.example',
      reference: 'https://example.com/docs',
      registryUrl: 'https://registry.example',
      searchKey: 'example',
      shouldConfig: true,
      sortOrder: 7,
      tags: ['search'],
      timeout: 30,
      trustedAt: 1_700_000_000_001,
      type: 'stdio',
    });
    expect(server.createdAt).toEqual(expect.any(String));
    expect(server.updatedAt).toEqual(expect.any(String));
    await expect(service.getById(server.id)).resolves.toEqual(server);
  });

  it('lists every transport and applies desktop id, active, and type filters', async () => {
    const stdio = await service.create({ isActive: true, name: 'Stdio', type: 'stdio' });
    await service.create({
      baseUrl: 'https://example.com/mcp',
      isActive: true,
      name: 'HTTP',
      type: 'streamableHttp',
    });
    await service.create({ isActive: false, name: 'Legacy' });

    const all = await service.list();
    expect(all).toMatchObject({ page: 1, total: 3 });
    expect(all.items.map((server) => server.type)).toEqual(['stdio', 'streamableHttp', undefined]);

    const byType = await service.list({ isActive: true, type: 'stdio' });
    expect(byType.items.map((server) => server.id)).toEqual([stdio.id]);
    const byId = await service.list({ id: stdio.id });
    expect(byId.items.map((server) => server.id)).toEqual([stdio.id]);
  });

  it('updates desktop metadata and finds servers by id or name', async () => {
    const server = await service.create({ name: 'Original', type: 'sse' });
    const updated = await service.update(server.id, {
      installSource: 'builtin',
      name: 'Renamed',
      provider: 'Provider',
      sortOrder: 9,
    });

    expect(updated).toMatchObject({
      installSource: 'builtin',
      name: 'Renamed',
      provider: 'Provider',
      sortOrder: 9,
      type: 'sse',
    });
    await expect(service.findByIdOrName(server.id)).resolves.toMatchObject({ id: server.id });
    await expect(service.findByIdOrName('Renamed')).resolves.toMatchObject({ id: server.id });
    await expect(service.findByIdOrName('missing')).resolves.toBeUndefined();
  });

  it('reorders all transports and deletes their assistant associations', async () => {
    const first = await service.create({ name: 'First', type: 'stdio' });
    const second = await service.create({ name: 'Second', type: 'inMemory' });

    await service.reorder([second.id, first.id]);
    const reordered = await service.list();
    expect(reordered.items.map((server) => server.id)).toEqual([second.id, first.id]);

    insertAssistant(sqlite, 'assistant-1');
    sqlite
      .prepare(
        `INSERT INTO assistant_mcp_server (
          assistant_id, mcp_server_id, created_at, updated_at
        ) VALUES ('assistant-1', ?, 1, 1)`,
      )
      .run(first.id);

    await service.delete(first.id);
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM assistant_mcp_server').get()).toEqual({
      count: 0,
    });
    await expect(service.getById(first.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
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
