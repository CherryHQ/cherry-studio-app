import { randomUUID as mockRandomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { drizzle } from 'drizzle-orm/sqlite-proxy';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import type { Database, DbService } from '@/backend/data/db/DbService';
import { schema } from '@/backend/data/db/schemas';

import type { PreferenceService } from '../../PreferenceService';
import { assistantService } from '../AssistantService';
import { McpServerService } from '../McpServerService';
import { pinService } from '../PinService';
import { topicService } from '../TopicService';
import { applyMigrations } from './_testDb';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));

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

  it('replaces the whole MCP association set on every update', async () => {
    const a = await mcpServerService.create({ endpointUrl: 'https://a.example/mcp', name: 'A' });
    const b = await mcpServerService.create({ endpointUrl: 'https://b.example/mcp', name: 'B' });
    const c = await mcpServerService.create({ endpointUrl: 'https://c.example/mcp', name: 'C' });
    insertAssistant(sqlite, 'assistant-1');
    insertAssociation(sqlite, 'assistant-1', c.id);

    await assistantService.update('assistant-1', { mcpServerIds: [a.id, b.id] });
    expect(associationIds(sqlite)).toEqual([a.id, b.id].sort());

    await assistantService.update('assistant-1', { mcpServerIds: [b.id, c.id] });
    expect(associationIds(sqlite)).toEqual([b.id, c.id].sort());

    await assistantService.update('assistant-1', { mcpServerIds: [] });
    expect(associationIds(sqlite)).toEqual([]);
  });

  it('rolls back relation changes when an MCP server id does not exist', async () => {
    const existing = await mcpServerService.create({
      endpointUrl: 'https://existing.example/mcp',
      name: 'Existing',
    });
    insertAssistant(sqlite, 'assistant-1');
    insertAssociation(sqlite, 'assistant-1', existing.id);

    await expect(
      assistantService.update('assistant-1', { mcpServerIds: ['missing-server'] }),
    ).rejects.toBeDefined();
    expect(associationIds(sqlite)).toEqual([existing.id]);
  });

  it('bypasses pins for updatedAt sorting', async () => {
    insertAssistant(sqlite, 'assistant-old', { updatedAt: 100 });
    insertAssistant(sqlite, 'assistant-new', { updatedAt: 200 });
    insertAssistant(sqlite, 'assistant-other', { updatedAt: 300 });
    insertPin(sqlite, 'assistant-old');

    const pinnedFirst = await assistantService.list({ limit: 100, page: 1 });
    expect(pinnedFirst.items[0]?.id).toBe('assistant-old');

    const scopedSearch = await assistantService.list({
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

  it('soft-deletes an assistant while preserving topics by default', async () => {
    // Spying rather than stubbing: the purge is a sibling the service imports
    // as a singleton, and against the real schema it can run for real.
    const purgeAssistantPin = jest.spyOn(pinService, 'purgeForEntityTx');
    insertAssistant(sqlite, 'assistant-delete');
    insertTopic(sqlite, 'topic-preserved', 'assistant-delete');

    await expect(assistantService.delete('assistant-delete')).resolves.toEqual({ deleted: true });
    expect(readAssistantDeleteState(sqlite, 'assistant-delete')).toEqual({
      deleted_at: expect.any(Number),
    });
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
    insertAssistant(sqlite, 'assistant-rollback');
    jest
      .spyOn(topicService, 'deleteByAssistantIdTx')
      .mockRejectedValueOnce(new Error('topic delete failed'));

    await expect(
      assistantService.delete('assistant-rollback', { deleteTopics: true }),
    ).rejects.toThrow('topic delete failed');
    expect(readAssistantDeleteState(sqlite, 'assistant-rollback')).toEqual({
      deleted_at: null,
    });
  });
});

function insertAssistant(
  database: DatabaseSync,
  id: string,
  options: { modelId?: string; updatedAt?: number } = {},
) {
  database
    .prepare(
      `INSERT INTO assistant (
        id, name, emoji, model_id, settings, order_key, created_at, updated_at
      ) VALUES (?, ?, 'x', ?, '{}', ?, 1, ?)`,
    )
    .run(id, id, options.modelId ?? null, id, options.updatedAt ?? 1);
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
  return database.prepare('SELECT deleted_at FROM assistant WHERE id = ?').get(id) as {
    deleted_at: number | null;
  };
}

function readTopicCount(database: DatabaseSync, id: string): number {
  const row = database.prepare('SELECT count(*) AS count FROM topic WHERE id = ?').get(id) as {
    count: number;
  };
  return row.count;
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
