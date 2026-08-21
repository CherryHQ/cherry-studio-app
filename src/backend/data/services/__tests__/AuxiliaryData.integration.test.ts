import { randomUUID as mockRandomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { drizzle } from 'drizzle-orm/sqlite-proxy';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import { customSqlStatements } from '@/backend/data/db/customSql';
import type { Database, DbService } from '@/backend/data/db/DbService';
import { schema } from '@/backend/data/db/schemas';

import { contentSearchService } from '../ContentSearchService';
import { entitySearchService } from '../EntitySearchService';
import { messageService } from '../MessageService';
import { topicService } from '../TopicService';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));
jest.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({ debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
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

  beforeEach(async () => {
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
    // Data services resolve `DbService` from `application`, so the fake is
    // installed as a host override instead of being passed to constructors.
    await installTestHost({ DbService: dbService });
  });

  afterEach(async () => {
    await uninstallTestHost();
    sqlite.close();
  });

  test('persists a chat and reads it through entity and content search', async () => {
    const topic = await topicService.create({ name: 'Needle topic' });
    const first = await messageService.create(topic.id, {
      data: { parts: [{ text: 'first question', type: 'text' }] },
      role: 'user',
    });
    const last = await messageService.create(topic.id, {
      data: { parts: [{ text: '**needle** answer', type: 'text' }] },
      role: 'assistant',
    });

    const entityResult = await entitySearchService.search({
      q: 'Needle',
      types: ['topic'],
    });
    expect(entityResult.groups[0]?.items[0]).toMatchObject({
      id: topic.id,
      title: 'Needle topic',
      type: 'topic',
    });

    const contentResult = await contentSearchService.search({
      q: 'needle',
    });
    expect(contentResult.items).toEqual([
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
