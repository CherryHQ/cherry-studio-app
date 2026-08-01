import { randomUUID as mockRandomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { drizzle } from 'drizzle-orm/sqlite-proxy';

import { customSqlStatements } from '@/backend/data/db/customSql';
import type { Database, DbService } from '@/backend/data/db/DbService';
import { schema } from '@/backend/data/db/schemas';

import { AgentGlobalSkillService } from '../AgentGlobalSkillService';
import { AiUsageRecordService } from '../AiUsageRecordService';
import { ContentSearchService } from '../ContentSearchService';
import { EntitySearchService } from '../EntitySearchService';
import { TemporaryChatService } from '../TemporaryChatService';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));
jest.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
  },
}));
jest.mock('fractional-indexing', () => ({
  generateKeyBetween: (lower: null | string) => `${lower ?? 'a'}0`,
  generateNKeysBetween: (lower: null | string, _upper: null | string, count: number) => {
    const keys: string[] = [];
    let previous = lower ?? 'a';
    for (let index = 0; index < count; index += 1) {
      previous = `${previous}0`;
      keys.push(previous);
    }
    return keys;
  },
}));

type MigrationJournal = { entries: { tag: string }[] };

describe('auxiliary Data API integration', () => {
  let sqlite: DatabaseSync;
  let dbService: DbService;

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:');
    sqlite.exec('PRAGMA foreign_keys = ON');
    applyMigrations(sqlite);
    for (const statement of customSqlStatements) sqlite.exec(statement);

    const database = drizzle(
      async (query, params, method) => {
        const statement = sqlite.prepare(query);
        if (method === 'run') {
          statement.run(...params);
          return { rows: [] };
        }
        if (method === 'get') {
          const row = statement.get(...params) as Record<string, unknown> | undefined;
          return { rows: row ? hybridRow(row) : [] };
        }
        const rows = statement.all(...params) as Record<string, unknown>[];
        return { rows: rows.map(hybridRow) };
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
  });

  afterEach(() => sqlite.close());

  test('persists a temporary chat and reads it through entity and content search', async () => {
    const temporaryChats = new TemporaryChatService(dbService, new AiUsageRecordService(dbService));
    const topic = temporaryChats.createTopic({ name: 'Needle topic' });
    const first = temporaryChats.appendMessage(topic.id, {
      data: { parts: [{ text: 'first question', type: 'text' }] },
      role: 'user',
    });
    const last = temporaryChats.appendMessage(topic.id, {
      data: { parts: [{ text: '**needle** answer', type: 'text' }] },
      role: 'assistant',
    });

    await expect(temporaryChats.persist(topic.id)).resolves.toEqual({
      messageCount: 2,
      topicId: topic.id,
    });
    expect(temporaryChats.hasTopic(topic.id)).toBe(false);

    const entityResult = await new EntitySearchService(dbService).search({
      q: 'Needle',
      types: ['topic'],
    });
    expect(entityResult.groups[0]?.items[0]).toMatchObject({
      id: topic.id,
      title: 'Needle topic',
      type: 'topic',
    });

    const contentResult = await new ContentSearchService(dbService).search({
      q: 'needle',
      sources: ['topic-message'],
    });
    expect(contentResult.groups[0]?.items).toEqual([
      expect.objectContaining({
        messageId: last.id,
        snippet: 'needle answer',
        topicId: topic.id,
      }),
    ]);

    const persistedRows = sqlite
      .prepare('SELECT id, parent_id FROM message WHERE topic_id = ? ORDER BY created_at, id')
      .all(topic.id) as Array<{ id: string; parent_id: null | string }>;
    const root = persistedRows.find((row) => row.parent_id === null);
    expect(root).toBeDefined();
    expect(persistedRows.find((row) => row.id === first.id)?.parent_id).toBe(root?.id);
    expect(persistedRows.find((row) => row.id === last.id)?.parent_id).toBe(first.id);
  });

  test('projects global skill enablement per agent without changing stored defaults', async () => {
    const skills = new AgentGlobalSkillService(dbService);
    const row = await skills.insert({
      contentHash: 'hash-1',
      folderName: 'builtin-skill',
      isEnabled: true,
      name: 'Builtin Skill',
      source: 'builtin',
    });
    await dbService
      .getDb()
      .insert(schema.agentTable)
      .values({
        description: '',
        configuration: { builtin_role: 'assistant' },
        instructions: '',
        model: null,
        name: 'Agent',
        orderKey: 'a0',
        type: 'claude-code',
      });
    const [agent] = await dbService.getDb().select().from(schema.agentTable).limit(1);

    await expect(skills.list()).resolves.toEqual([
      expect.objectContaining({ id: row.id, isEnabled: false, name: 'Builtin Skill' }),
    ]);
    await expect(skills.list({ agentId: agent.id })).resolves.toEqual([
      expect.objectContaining({ id: row.id, isEnabled: true }),
    ]);
    await skills.upsertJoin(agent.id, row.id, false);
    await expect(skills.list({ agentId: agent.id })).resolves.toEqual([
      expect.objectContaining({ id: row.id, isEnabled: false }),
    ]);

    const search = await new EntitySearchService(dbService).search({
      q: 'Diagnose issues',
      types: ['agent'],
    });
    expect(search.groups[0]?.items).toEqual([
      expect.objectContaining({
        id: agent.id,
        subtitle: expect.stringContaining('Built-in Cherry Studio advisor'),
      }),
    ]);
  });
});

function applyMigrations(database: DatabaseSync): void {
  const directory = `${process.cwd()}/migrations/sqlite-drizzle`;
  const journal = JSON.parse(
    readFileSync(`${directory}/meta/_journal.json`, 'utf8'),
  ) as MigrationJournal;
  for (const { tag } of journal.entries) {
    const migration = readFileSync(`${directory}/${tag}.sql`, 'utf8');
    for (const statement of migration.split('--> statement-breakpoint')) {
      if (statement.trim()) database.exec(statement);
    }
  }
}

function hybridRow(row: Record<string, unknown>): unknown[] {
  return Object.assign(Object.values(row), row);
}
