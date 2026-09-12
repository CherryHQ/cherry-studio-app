import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

type MigrationJournal = { entries: { tag: string }[] };

const oauthMigrationTag = '0003_retire-oauth-provider-auth';

const baseRow = {
  provider_id: 'silicon',
  name: 'SiliconFlow',
  api_keys: JSON.stringify([{ id: 'k1', isEnabled: true, key: 'sk-minted-by-oauth' }]),
  order_key: 'a0',
  created_at: 1_785_427_200_000,
  updated_at: 1_785_427_200_000,
};

describe('user_provider oauth retirement migration', () => {
  let database: DatabaseSync;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.exec('PRAGMA foreign_keys = ON');
    applyMigrationsBefore(database, oauthMigrationTag);
  });

  afterEach(() => {
    database.close();
  });

  it('clears oauth auth_config while keeping the minted API keys', () => {
    insertProvider(database, {
      ...baseRow,
      auth_config: JSON.stringify({
        type: 'oauth',
        clientId: 'client-1',
        accessToken: 'stale-token',
      }),
      provider_settings: JSON.stringify({
        oauthAvatar: 'https://example.com/a.png',
        oauthUsername: 'daisy',
        rateLimit: 5,
      }),
    });

    applyMigration(database, oauthMigrationTag);

    const row = database
      .prepare('SELECT auth_config, api_keys, provider_settings FROM user_provider')
      .get() as { auth_config: string | null; api_keys: string; provider_settings: string };
    expect(row.auth_config).toBeNull();
    expect(JSON.parse(row.api_keys)).toEqual([
      { id: 'k1', isEnabled: true, key: 'sk-minted-by-oauth' },
    ]);
    expect(JSON.parse(row.provider_settings)).toEqual({ rateLimit: 5 });
  });

  it('leaves IAM auth_config and null settings untouched', () => {
    insertProvider(database, {
      ...baseRow,
      auth_config: JSON.stringify({ type: 'iam-gcp', location: 'us-central1', project: 'p1' }),
      provider_settings: null,
    });

    applyMigration(database, oauthMigrationTag);

    const row = database
      .prepare('SELECT auth_config, provider_settings FROM user_provider')
      .get() as { auth_config: string; provider_settings: string | null };
    expect(JSON.parse(row.auth_config)).toEqual({
      type: 'iam-gcp',
      location: 'us-central1',
      project: 'p1',
    });
    expect(row.provider_settings).toBeNull();
  });
});

function insertProvider(database: DatabaseSync, row: Record<string, unknown>): void {
  const columns = Object.keys(row);
  database
    .prepare(
      `INSERT INTO user_provider (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    )
    .run(...(Object.values(row) as (bigint | number | string | null)[]));
}

function readJournalTags(): string[] {
  const directory = `${process.cwd()}/migrations/sqlite-drizzle`;
  const journal = JSON.parse(
    readFileSync(`${directory}/meta/_journal.json`, 'utf8'),
  ) as MigrationJournal;
  return journal.entries.map(({ tag }) => tag);
}

function applyMigration(database: DatabaseSync, tag: string): void {
  const migration = readFileSync(`${process.cwd()}/migrations/sqlite-drizzle/${tag}.sql`, 'utf8');
  for (const statement of migration.split('--> statement-breakpoint')) {
    if (statement.trim()) database.exec(statement);
  }
}

function applyMigrationsBefore(database: DatabaseSync, stopTag: string): void {
  for (const tag of readJournalTags()) {
    if (tag === stopTag) return;
    applyMigration(database, tag);
  }
}
