import { randomUUID as mockRandomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { drizzle } from 'drizzle-orm/sqlite-proxy';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import type { Database, DbService } from '@/backend/data/db/DbService';
import { schema } from '@/backend/data/db/schemas';

import type { PreferenceService } from '../../PreferenceService';
import { assistantService } from '../AssistantService';
import { groupService } from '../GroupService';
import { McpServerService } from '../McpServerService';
import { pinService } from '../PinService';
import { tagService } from '../TagService';
import { topicService } from '../TopicService';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));

type MigrationJournal = { entries: { tag: string }[] };

describe('AssistantService persistence', () => {
  let sqlite: DatabaseSync;
  let dbService: DbService;
  let mcpServerService: McpServerService;

  beforeEach(async () => {
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
    // Data services resolve `DbService` from `application`, so the fake is
    // installed as a host override instead of being passed to constructors.
    await installTestHost({
      DbService: dbService,
      PreferenceService: { get: jest.fn(async () => null) } as unknown as PreferenceService,
    });
    mcpServerService = new McpServerService();
  });

  afterEach(async () => {
    await uninstallTestHost();
    jest.restoreAllMocks();
    sqlite.close();
  });

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

  it('resolves inherited preset model names when reading assistants', async () => {
    insertPresetModel(sqlite, 'openai-codex', 'gpt-5-6-sol');
    insertAssistant(sqlite, 'assistant-with-preset', {
      modelId: 'openai-codex::gpt-5-6-sol',
    });

    const listed = await assistantService.list({ limit: 100, page: 1 });
    const fetched = await assistantService.getById('assistant-with-preset');

    expect(listed.items).toEqual([
      expect.objectContaining({ id: 'assistant-with-preset', modelName: 'GPT-5.6 Sol' }),
    ]);
    expect(fetched.modelName).toBe('GPT-5.6 Sol');
  });

  it('reuses an exact-name group across atomic legacy imports', async () => {
    const groupName = 'x'.repeat(65);
    const first = await assistantService.createFromImport({ groupName, name: 'First' });
    const second = await assistantService.createFromImport({ groupName, name: 'Second' });

    expect(first.groupId).toBeTruthy();
    expect(second.groupId).toBe(first.groupId);
    expect(
      sqlite.prepare(`SELECT count(*) AS count FROM "group" WHERE entity_type = 'assistant'`).get(),
    ).toEqual({ count: 1 });
  });

  it('rolls back a newly created import group when the assistant insert fails', async () => {
    sqlite.exec(`
      CREATE TRIGGER fail_assistant_import
      BEFORE INSERT ON assistant
      BEGIN
        SELECT RAISE(ABORT, 'assistant insert failed');
      END
    `);

    await expect(
      assistantService.createFromImport({ groupName: 'Rolled back', name: 'Imported' }),
    ).rejects.toThrow();
    expect(
      sqlite.prepare(`SELECT count(*) AS count FROM "group" WHERE name = 'Rolled back'`).get(),
    ).toEqual({ count: 0 });
  });

  it('soft-deletes an assistant while preserving topics by default', async () => {
    // Spying rather than stubbing: the purges are siblings the service imports
    // as singletons, and against the real schema they can run for real.
    const purgeAssistantTags = jest.spyOn(tagService, 'purgeForEntityTx');
    const purgeAssistantPin = jest.spyOn(pinService, 'purgeForEntityTx');
    const group = await groupService.create({ entityType: 'assistant', name: 'Work' });
    insertAssistant(sqlite, 'assistant-delete', { groupId: group.id });
    insertTopic(sqlite, 'topic-preserved', 'assistant-delete');

    await expect(assistantService.delete('assistant-delete')).resolves.toEqual({ deleted: true });
    expect(readAssistantDeleteState(sqlite, 'assistant-delete')).toEqual({
      deleted_at: expect.any(Number),
      group_id: null,
    });
    expect(purgeAssistantTags).toHaveBeenCalledWith(
      expect.anything(),
      'assistant',
      'assistant-delete',
    );
    expect(purgeAssistantPin).toHaveBeenCalledWith(
      expect.anything(),
      'assistant',
      'assistant-delete',
    );
    expect(readTopicCount(sqlite, 'topic-preserved')).toBe(1);
  });

  it('deletes assistant topics in the same transaction when requested', async () => {
    insertAssistant(sqlite, 'assistant-delete-topics');
    insertTopic(sqlite, 'topic-a', 'assistant-delete-topics');
    insertTopic(sqlite, 'topic-b', 'assistant-delete-topics');

    const result = await assistantService.delete('assistant-delete-topics', {
      deleteTopics: true,
    });
    expect(result.deleted).toBe(true);
    expect(result.deletedTopicIds?.sort()).toEqual(['topic-a', 'topic-b']);
    expect(readTopicCount(sqlite, 'topic-a')).toBe(0);
    expect(readTopicCount(sqlite, 'topic-b')).toBe(0);
  });

  it('rolls back the assistant delete when topic cleanup fails', async () => {
    const group = await groupService.create({ entityType: 'assistant', name: 'Work' });
    insertAssistant(sqlite, 'assistant-rollback', { groupId: group.id });
    jest
      .spyOn(topicService, 'deleteByAssistantIdTx')
      .mockRejectedValueOnce(new Error('topic delete failed'));

    await expect(
      assistantService.delete('assistant-rollback', { deleteTopics: true }),
    ).rejects.toThrow('topic delete failed');
    expect(readAssistantDeleteState(sqlite, 'assistant-rollback')).toEqual({
      deleted_at: null,
      group_id: group.id,
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

function insertAssistant(
  database: DatabaseSync,
  id: string,
  options: { groupId?: string; modelId?: string; updatedAt?: number } = {},
) {
  database
    .prepare(
      `INSERT INTO assistant (
        id, name, emoji, group_id, model_id, settings, order_key, created_at, updated_at
      ) VALUES (?, ?, 'x', ?, ?, '{}', ?, 1, ?)`,
    )
    .run(id, id, options.groupId ?? null, options.modelId ?? null, id, options.updatedAt ?? 1);
}

function insertPresetModel(database: DatabaseSync, providerId: string, modelId: string) {
  database
    .prepare(
      `INSERT INTO user_provider (provider_id, name, order_key, created_at, updated_at)
       VALUES (?, ?, ?, 1, 1)`,
    )
    .run(providerId, providerId, providerId);
  database
    .prepare(
      `INSERT INTO user_model (
        id, provider_id, model_id, preset_model_id, order_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, 1)`,
    )
    .run(`${providerId}::${modelId}`, providerId, modelId, modelId, modelId);
}

function insertPin(database: DatabaseSync, assistantId: string) {
  database
    .prepare(
      `INSERT INTO pin (id, entity_type, entity_id, order_key, created_at, updated_at)
       VALUES (?, 'assistant', ?, 'a0', 1, 1)`,
    )
    .run(`pin-${assistantId}`, assistantId);
}

function insertTopic(database: DatabaseSync, id: string, assistantId: string) {
  database
    .prepare(
      `INSERT INTO topic (id, name, assistant_id, order_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, 1)`,
    )
    .run(id, id, assistantId, id);
}

function readAssistantDeleteState(database: DatabaseSync, id: string) {
  return database.prepare('SELECT deleted_at, group_id FROM assistant WHERE id = ?').get(id) as {
    deleted_at: number | null;
    group_id: string | null;
  };
}

function readTopicCount(database: DatabaseSync, id: string): number {
  const row = database.prepare('SELECT count(*) AS count FROM topic WHERE id = ?').get(id) as {
    count: number;
  };
  return row.count;
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
