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

  test('persists an Agent Session and reads it through entity and content search', async () => {
    const now = Date.now();
    const agentId = mockRandomUUID();
    const sessionId = mockRandomUUID();
    const turnId = mockRandomUUID();
    const userMessageId = mockRandomUUID();
    const assistantMessageId = mockRandomUUID();
    sqlite
      .prepare(
        'INSERT INTO agent (id, name, order_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(agentId, 'Needle Agent', 'a0', now, now);
    sqlite
      .prepare(
        'INSERT INTO agent_session (id, agent_id, title, title_is_manual, last_activity_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(sessionId, agentId, 'Needle Session', 1, now, now, now);
    sqlite
      .prepare(
        'INSERT INTO agent_session_message (id, session_id, turn_id, role, data, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        userMessageId,
        sessionId,
        turnId,
        'user',
        JSON.stringify({
          parts: [{ id: 'question-0', text: 'first question', type: 'text', state: 'done' }],
          version: 1,
        }),
        'success',
        now,
        now,
      );
    sqlite
      .prepare(
        'INSERT INTO agent_session_message (id, session_id, turn_id, role, data, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        assistantMessageId,
        sessionId,
        turnId,
        'assistant',
        JSON.stringify({
          parts: [{ id: 'answer-0', text: '**needle** answer', type: 'text', state: 'done' }],
          version: 1,
        }),
        'success',
        now + 1,
        now + 1,
      );

    const entityResult = await entitySearchService.search({
      q: 'Needle',
      types: ['session'],
    });
    expect(entityResult.groups[0]?.items[0]).toMatchObject({
      id: sessionId,
      subtitle: 'Needle Agent',
      title: 'Needle Session',
      type: 'session',
    });

    const contentResult = await contentSearchService.search({
      q: 'needle',
    });
    expect(contentResult.items).toEqual([
      expect.objectContaining({
        messageId: assistantMessageId,
        sessionId,
        snippet: 'needle answer',
      }),
    ]);

    const persistedRows = sqlite
      .prepare(
        'SELECT id, turn_id AS turnId FROM agent_session_message WHERE session_id = ? ORDER BY created_at, id',
      )
      .all(sessionId) as { id: string; turnId: null | string }[];
    expect(persistedRows.map((row) => row.id)).toEqual([userMessageId, assistantMessageId]);
    expect(persistedRows[0]?.turnId).toBe(turnId);
    expect(persistedRows[1]?.turnId).toBe(turnId);
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
