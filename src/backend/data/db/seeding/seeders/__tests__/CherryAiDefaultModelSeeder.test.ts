import { randomUUID as mockRandomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import {
  CHERRYAI_API_BASE_URL,
  CHERRYAI_DEFAULT_MODEL_GROUP,
  CHERRYAI_DEFAULT_MODEL_ID,
  CHERRYAI_DEFAULT_MODEL_NAME,
  CHERRYAI_DEFAULT_UNIQUE_MODEL_ID,
  CHERRYAI_PROVIDER_ID,
} from '@cherrystudio/universal/data/presets/cherryai';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/sqlite-proxy';

import type { Database, DbService } from '@/backend/data/db/DbService';
import {
  preferenceTable,
  schema,
  userModelTable,
  userProviderTable,
} from '@/backend/data/db/schemas';

import {
  CherryAiDefaultModelSeeder,
  DEFAULT_MODEL_PREFERENCE_KEYS,
} from '../CherryAiDefaultModelSeeder';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));
jest.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({ warn: jest.fn() }),
  },
}));

type MigrationJournal = { entries: { tag: string }[] };

describe('CherryAiDefaultModelSeeder', () => {
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

  afterEach(() => sqlite.close());

  test('atomically seeds the CherryAI provider, Qwen model, and missing preferences', async () => {
    await new CherryAiDefaultModelSeeder().run(dbService);

    const [provider] = await database
      .select()
      .from(userProviderTable)
      .where(eq(userProviderTable.providerId, CHERRYAI_PROVIDER_ID))
      .limit(1);
    const [model] = await database
      .select()
      .from(userModelTable)
      .where(eq(userModelTable.id, CHERRYAI_DEFAULT_UNIQUE_MODEL_ID))
      .limit(1);

    expect(provider).toMatchObject({
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      isEnabled: true,
      name: 'CherryAI',
      presetProviderId: CHERRYAI_PROVIDER_ID,
      providerId: CHERRYAI_PROVIDER_ID,
    });
    expect(provider?.endpointConfigs?.[ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]?.baseUrl).toBe(
      CHERRYAI_API_BASE_URL,
    );
    expect(model).toMatchObject({
      group: CHERRYAI_DEFAULT_MODEL_GROUP,
      id: CHERRYAI_DEFAULT_UNIQUE_MODEL_ID,
      isEnabled: true,
      isHidden: false,
      modelId: CHERRYAI_DEFAULT_MODEL_ID,
      name: CHERRYAI_DEFAULT_MODEL_NAME,
      providerId: CHERRYAI_PROVIDER_ID,
    });

    for (const key of DEFAULT_MODEL_PREFERENCE_KEYS) {
      await expect(readPreference(key)).resolves.toBe(CHERRYAI_DEFAULT_UNIQUE_MODEL_ID);
    }
  });

  test('preserves existing preference values, including null and empty strings', async () => {
    const values = [null, '', 'openai::gpt-4o', 'google::gemini-2.5-flash'] as const;
    await database.insert(preferenceTable).values(
      DEFAULT_MODEL_PREFERENCE_KEYS.map((key, index) => ({
        key,
        scope: 'default',
        value: values[index],
      })),
    );

    await new CherryAiDefaultModelSeeder().run(dbService);

    for (const [index, key] of DEFAULT_MODEL_PREFERENCE_KEYS.entries()) {
      await expect(readPreference(key)).resolves.toBe(values[index]);
    }
  });

  test('preserves an existing CherryAI provider while repairing its missing model', async () => {
    await database.insert(userProviderTable).values({
      isEnabled: false,
      name: 'Renamed CherryAI',
      orderKey: 'a0',
      presetProviderId: CHERRYAI_PROVIDER_ID,
      providerId: CHERRYAI_PROVIDER_ID,
    });

    await new CherryAiDefaultModelSeeder().run(dbService);

    const [provider] = await database
      .select()
      .from(userProviderTable)
      .where(eq(userProviderTable.providerId, CHERRYAI_PROVIDER_ID))
      .limit(1);
    const [model] = await database
      .select({ id: userModelTable.id })
      .from(userModelTable)
      .where(eq(userModelTable.id, CHERRYAI_DEFAULT_UNIQUE_MODEL_ID))
      .limit(1);
    expect(provider).toMatchObject({ isEnabled: false, name: 'Renamed CherryAI' });
    expect(model?.id).toBe(CHERRYAI_DEFAULT_UNIQUE_MODEL_ID);
  });

  test('rolls back the provider and model when a later preference insert fails', async () => {
    sqlite.exec(`
      CREATE TRIGGER fail_default_preference
      BEFORE INSERT ON preference
      BEGIN
        SELECT RAISE(ABORT, 'preference insert failed');
      END;
    `);

    await expect(new CherryAiDefaultModelSeeder().run(dbService)).rejects.toThrow(
      'insert into "preference"',
    );

    expect(readCount('user_provider')).toBe(0);
    expect(readCount('user_model')).toBe(0);
    expect(readCount('preference')).toBe(0);
  });

  async function readPreference(key: string) {
    const [preference] = await database
      .select({ value: preferenceTable.value })
      .from(preferenceTable)
      .where(and(eq(preferenceTable.scope, 'default'), eq(preferenceTable.key, key)))
      .limit(1);
    return preference?.value;
  }

  function readCount(table: 'preference' | 'user_model' | 'user_provider') {
    return (sqlite.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number })
      .count;
  }
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
