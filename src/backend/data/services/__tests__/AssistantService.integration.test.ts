import { randomUUID as mockRandomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { drizzle } from 'drizzle-orm/sqlite-proxy';

import type { Database, DbService } from '@/backend/data/db/DbService';
import { schema } from '@/backend/data/db/schemas';

import type { PreferenceService } from '../../PreferenceService';
import { AssistantService } from '../AssistantService';
import { GroupService } from '../GroupService';
import { McpServerService } from '../McpServerService';
import type { ModelService } from '../ModelService';
import type { PinService } from '../PinService';
import type { TagService } from '../TagService';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));

type MigrationJournal = { entries: { tag: string }[] };

describe('AssistantService persistence', () => {
  let sqlite: DatabaseSync;
  let assistantService: AssistantService;
  let groupService: GroupService;
  let mcpServerService: McpServerService;

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
    const tagService = {
      getTagsByEntitiesTx: jest.fn(async () => new Map()),
    } as unknown as TagService;
    groupService = new GroupService(dbService);
    assistantService = new AssistantService(
      dbService,
      groupService,
      {} as ModelService,
      { get: jest.fn(async () => null) } as unknown as PreferenceService,
      tagService,
      {} as PinService,
    );
    mcpServerService = new McpServerService(dbService);
  });

  afterEach(() => sqlite.close());

  it('replaces all MCP associations regardless of transport', async () => {
    const a = await mcpServerService.create(
      { baseUrl: 'https://a.example/mcp', name: 'A' },
      'streamableHttp',
    );
    const b = await mcpServerService.create(
      { baseUrl: 'https://b.example/mcp', name: 'B' },
      'streamableHttp',
    );
    const c = await mcpServerService.create(
      { baseUrl: 'https://c.example/mcp', name: 'C' },
      'streamableHttp',
    );
    insertRawServer(sqlite, 'hidden-stdio', 'Hidden', 'stdio');
    insertAssistant(sqlite, 'assistant-1');
    insertAssociation(sqlite, 'assistant-1', 'hidden-stdio');

    await assistantService.update('assistant-1', {
      mcpServerIds: [a.id, b.id, 'hidden-stdio'],
    });
    expect(associationIds(sqlite)).toEqual([a.id, b.id, 'hidden-stdio'].sort());

    await assistantService.update('assistant-1', { mcpServerIds: [b.id, c.id] });
    expect(associationIds(sqlite)).toEqual([b.id, c.id].sort());

    await assistantService.update('assistant-1', { mcpServerIds: [] });
    expect(associationIds(sqlite)).toEqual([]);
  });

  it('rolls back relation changes when an MCP server id does not exist', async () => {
    const existing = await mcpServerService.create(
      { baseUrl: 'https://existing.example/mcp', name: 'Existing' },
      'streamableHttp',
    );
    insertAssistant(sqlite, 'assistant-1');
    insertAssociation(sqlite, 'assistant-1', existing.id);

    await expect(
      assistantService.update('assistant-1', { mcpServerIds: ['missing-server'] }),
    ).rejects.toBeDefined();
    expect(associationIds(sqlite)).toEqual([existing.id]);
  });

  it('creates, replaces, and clears an assistant group', async () => {
    const first = await groupService.create({ entityType: 'assistant', name: 'Work' });
    const second = await groupService.create({ entityType: 'assistant', name: 'Personal' });

    const created = await assistantService.create({ groupId: first.id, name: 'Grouped' });
    expect(created.groupId).toBe(first.id);

    const replaced = await assistantService.update(created.id, { groupId: second.id });
    expect(replaced.groupId).toBe(second.id);

    const cleared = await assistantService.update(created.id, { groupId: null });
    expect(cleared.groupId).toBeNull();
  });

  it('rejects missing groups and groups owned by another entity type', async () => {
    const topicGroup = await groupService.create({ entityType: 'topic', name: 'Topics' });

    await expect(
      assistantService.create({
        groupId: '99999999-9999-4999-8999-999999999999',
        name: 'Missing group',
      }),
    ).rejects.toMatchObject({ details: { fieldErrors: { groupId: expect.any(Array) } } });
    await expect(
      assistantService.create({ groupId: topicGroup.id, name: 'Wrong group' }),
    ).rejects.toMatchObject({ details: { fieldErrors: { groupId: expect.any(Array) } } });
  });

  it('filters by group and bypasses pins for updatedAt sorting', async () => {
    const group = await groupService.create({ entityType: 'assistant', name: 'Work' });
    insertAssistant(sqlite, 'assistant-old', { groupId: group.id, updatedAt: 100 });
    insertAssistant(sqlite, 'assistant-new', { groupId: group.id, updatedAt: 200 });
    insertAssistant(sqlite, 'assistant-other', { updatedAt: 300 });
    insertPin(sqlite, 'assistant-old');

    const grouped = await assistantService.list({ groupId: group.id, limit: 100, page: 1 });
    expect(grouped.items.map((assistant) => assistant.id)).toEqual([
      'assistant-old',
      'assistant-new',
    ]);

    const scopedSearch = await assistantService.list({
      groupId: group.id,
      limit: 100,
      page: 1,
      search: 'new',
      updatedAtFrom: new Date(200).toISOString(),
    });
    expect(scopedSearch.items.map((assistant) => assistant.id)).toEqual(['assistant-new']);

    const freshest = await assistantService.list({
      limit: 100,
      page: 1,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });
    expect(freshest.items.map((assistant) => assistant.id)).toEqual([
      'assistant-other',
      'assistant-new',
      'assistant-old',
    ]);
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

function insertAssistant(
  database: DatabaseSync,
  id: string,
  options: { groupId?: string; updatedAt?: number } = {},
) {
  database
    .prepare(
      `INSERT INTO assistant (id, name, emoji, group_id, settings, order_key, created_at, updated_at)
       VALUES (?, ?, 'x', ?, '{}', ?, 1, ?)`,
    )
    .run(id, id, options.groupId ?? null, id, options.updatedAt ?? 1);
}

function insertPin(database: DatabaseSync, assistantId: string) {
  database
    .prepare(
      `INSERT INTO pin (id, entity_type, entity_id, order_key, created_at, updated_at)
       VALUES (?, 'assistant', ?, 'a0', 1, 1)`,
    )
    .run(`pin-${assistantId}`, assistantId);
}

function insertRawServer(
  database: DatabaseSync,
  id: string,
  name: string,
  type: 'stdio' | 'streamableHttp',
) {
  database
    .prepare(
      `INSERT INTO mcp_server (
        id, name, type, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, 1, 1, 1)`,
    )
    .run(id, name, type);
}

function insertAssociation(database: DatabaseSync, assistantId: string, mcpServerId: string) {
  database
    .prepare(
      `INSERT INTO assistant_mcp_server (
        assistant_id, mcp_server_id, created_at, updated_at
      ) VALUES (?, ?, 1, 1)`,
    )
    .run(assistantId, mcpServerId);
}

function associationIds(database: DatabaseSync): string[] {
  return (
    database.prepare('SELECT mcp_server_id FROM assistant_mcp_server').all() as {
      mcp_server_id: string;
    }[]
  )
    .map((row) => row.mcp_server_id)
    .sort();
}
