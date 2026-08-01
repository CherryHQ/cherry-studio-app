import { randomUUID as mockRandomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';

import type { Database, DbService } from '@/backend/data/db/DbService';
import { schema } from '@/backend/data/db/schemas';

import { McpServerService } from '../McpServerService';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));

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

  it('creates a normalized Streamable HTTP server through the constrained contract', async () => {
    const server = await service.create(
      { baseUrl: 'https://example.com/mcp', name: ' Example ' },
      'streamableHttp',
    );

    expect(server).toMatchObject({
      baseUrl: 'https://example.com/mcp',
      description: '',
      disabledAutoApproveTools: [],
      disabledTools: [],
      headers: {},
      isActive: false,
      name: 'Example',
      timeout: undefined,
      type: 'streamableHttp',
    });
  });

  it('validates constrained creates and updates at runtime', async () => {
    await expect(
      service.create({ baseUrl: 'not-a-url', name: 'Invalid' }, 'streamableHttp'),
    ).rejects.toBeDefined();

    const server = await service.create(
      { baseUrl: 'https://example.com/mcp', name: 'Valid' },
      'streamableHttp',
    );
    await expect(
      service.update(server.id, { provider: 'not-mobile-mutable' } as never, 'streamableHttp'),
    ).rejects.toBeDefined();
  });

  it('rejects duplicate constrained names on create and update', async () => {
    await service.create({ baseUrl: 'https://a.example/mcp', name: 'Dup' }, 'streamableHttp');
    await expect(
      service.create({ baseUrl: 'https://b.example/mcp', name: 'Dup' }, 'streamableHttp'),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const other = await service.create(
      { baseUrl: 'https://c.example/mcp', name: 'Other' },
      'streamableHttp',
    );
    await expect(service.update(other.id, { name: 'Dup' }, 'streamableHttp')).rejects.toMatchObject(
      { code: 'CONFLICT' },
    );
    await expect(
      service.update(other.id, { name: 'Other', timeout: 30 }, 'streamableHttp'),
    ).resolves.toMatchObject({ name: 'Other', timeout: 30 });
  });

  it('narrows reads and mutations to Streamable HTTP rows', async () => {
    insertRawServer(sqlite, {
      baseUrl: null,
      id: 'remote-first',
      name: 'Remote First',
      sortOrder: 10,
      type: 'streamableHttp',
    });
    insertRawServer(sqlite, {
      baseUrl: 'https://later.example/mcp',
      id: 'remote-later',
      name: 'Remote Later',
      sortOrder: 20,
      type: 'streamableHttp',
    });
    insertRawServer(sqlite, { id: 'stdio', name: 'Stdio', type: 'stdio' });

    const result = await service.list({ type: 'streamableHttp' });

    expect(result.items.map(({ baseUrl, name }) => ({ baseUrl, name }))).toEqual([
      { baseUrl: '', name: 'Remote First' },
      { baseUrl: 'https://later.example/mcp', name: 'Remote Later' },
    ]);
    await expect(service.getById('stdio', 'streamableHttp')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      service.update('stdio', { description: 'Wrong transport' }, 'streamableHttp'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.delete('stdio', 'streamableHttp')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('preserves synchronized desktop metadata on constrained updates', async () => {
    const server = await service.create({
      baseUrl: 'https://example.com/mcp',
      dxtVersion: '1.2.3',
      installSource: 'protocol',
      isTrusted: true,
      name: 'Remote',
      provider: 'Desktop Provider',
      sortOrder: 7,
      tags: ['search', 'remote'],
      type: 'streamableHttp',
    });

    const updated = await service.update(server.id, { description: 'Updated' }, 'streamableHttp');

    expect(updated).toMatchObject({
      description: 'Updated',
      dxtVersion: '1.2.3',
      installSource: 'protocol',
      isTrusted: true,
      provider: 'Desktop Provider',
      sortOrder: 7,
      tags: ['search', 'remote'],
    });
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

function insertRawServer(
  database: DatabaseSync,
  values: {
    baseUrl?: string | null;
    id: string;
    name: string;
    sortOrder?: number;
    type: 'stdio' | 'streamableHttp';
  },
) {
  database
    .prepare(
      `INSERT INTO mcp_server (
        id, name, type, base_url, sort_order, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, 1, 1)`,
    )
    .run(values.id, values.name, values.type, values.baseUrl ?? null, values.sortOrder ?? 0);
}
