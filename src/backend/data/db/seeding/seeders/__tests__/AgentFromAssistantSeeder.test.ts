import { randomUUID as mockRandomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { drizzle } from 'drizzle-orm/sqlite-proxy';

import type { Database, DbService } from '@/backend/data/db/DbService';
import {
  type InsertAssistantRow,
  agentTable,
  assistantTable,
  schema,
} from '@/backend/data/db/schemas';
import { DEFAULT_ASSISTANT_SETTINGS } from '@/shared/data/types/assistant';

import { AgentFromAssistantSeeder } from '../AgentFromAssistantSeeder';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));

type MigrationJournal = { entries: { tag: string }[] };

describe('AgentFromAssistantSeeder', () => {
  let database: Database;
  let dbService: DbService;
  let sqlite: DatabaseSync;

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:');
    sqlite.exec('PRAGMA foreign_keys = ON');
    applyMigrations(sqlite);
    database = createDatabase(sqlite);
    dbService = createDbService(sqlite, database);
  });

  afterEach(() => {
    sqlite.close();
  });

  async function insertAssistant(overrides: Partial<InsertAssistantRow> = {}) {
    const [row] = await database
      .insert(assistantTable)
      .values({
        name: 'Assistant',
        emoji: '🌟',
        settings: { ...DEFAULT_ASSISTANT_SETTINGS },
        orderKey: `a${Math.random()}`,
        prompt: 'Be helpful.',
        ...overrides,
      })
      .returning();
    return row;
  }

  test('copies live assistants into agent rows, reusing ids and mapping settings', async () => {
    const enabled = await insertAssistant({
      name: 'Tuned',
      prompt: 'Stay curious.',
      modelId: null,
      settings: {
        ...DEFAULT_ASSISTANT_SETTINGS,
        enableMaxTokens: true,
        enableTemperature: true,
        maxTokens: 2048,
        reasoning_effort: 'high',
        temperature: 0.4,
      },
    });
    const softDeleted = await insertAssistant({ deletedAt: Date.now() });

    await new AgentFromAssistantSeeder().run(dbService);

    const agents = await database.select().from(agentTable);
    expect(agents.map((agent) => agent.id)).toEqual([enabled.id]);
    expect(agents[0]).toMatchObject({
      name: 'Tuned',
      instructions: 'Stay curious.',
      avatar: null,
      settings: { maxOutputTokens: 2048, reasoningEffort: 'high', temperature: 0.4 },
      orderKey: enabled.orderKey,
      createdAt: enabled.createdAt,
      deletedAt: null,
    });
    expect(agents.map((agent) => agent.id)).not.toContain(softDeleted.id);
  });

  test('drops disabled and non-concrete settings instead of carrying them', async () => {
    // DEFAULT_ASSISTANT_SETTINGS disables temperature/max tokens and uses a
    // non-concrete reasoning effort, so nothing survives the mapping.
    await insertAssistant();

    await new AgentFromAssistantSeeder().run(dbService);

    const [agent] = await database.select().from(agentTable);
    expect(agent?.settings).toEqual({});
  });

  test('is append-only: existing agent rows win and reruns add only new ids', async () => {
    const original = await insertAssistant({ name: 'Original' });
    await new AgentFromAssistantSeeder().run(dbService);

    // The user edits the agent independently of the assistant.
    await database.update(agentTable).set({ name: 'Edited Agent' });
    const late = await insertAssistant({ name: 'Late Arrival' });

    await new AgentFromAssistantSeeder().run(dbService);

    const agents = await database.select().from(agentTable);
    expect(agents).toHaveLength(2);
    expect(agents.find((agent) => agent.id === original.id)?.name).toBe('Edited Agent');
    expect(agents.find((agent) => agent.id === late.id)?.name).toBe('Late Arrival');
  });

  test('does nothing on a database without assistants', async () => {
    await new AgentFromAssistantSeeder().run(dbService);
    expect(await database.select().from(agentTable)).toEqual([]);
  });
});

function createDatabase(sqlite: DatabaseSync) {
  return drizzle(
    async (query, params, method) => {
      const statement = sqlite.prepare(query);
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
}

function createDbService(sqlite: DatabaseSync, database: Database) {
  return {
    getDb: () => database,
    withWriteTx: async <TValue>(callback: (tx: Database) => Promise<TValue>) => {
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
}

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
