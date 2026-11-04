import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { Directory, File } from 'expo-file-system';

import { toAgentMessageView } from '@/backend/data/services/utils/agentSessionRows';

import {
  bundledBackupVersion,
  normalizeBackupDatabase,
  prepareRestoredDatabase,
  validateBackupDatabase,
  type BackupDatabaseVersion,
} from '../backupDatabase';
import { customSqlStatements } from '../customSql';

type MigrationBundle = typeof import('../migrations').migrations;
type MockSqlParams = (SQLInputValue | SQLInputValue[])[];

const currentBundle =
  jest.requireActual<typeof import('../migrations')>('../migrations').migrations;
/** The migration bundle of the app version under test; unset means the current bundle. */
let mockAppBundle: MigrationBundle | undefined;
const mockCacheDirectory = mkdtempSync(join(tmpdir(), 'backup-lineage-'));

jest.mock('../migrations', () => ({
  get migrations() {
    return (
      mockAppBundle ??
      jest.requireActual<typeof import('../migrations')>('../migrations').migrations
    );
  },
}));

jest.mock('expo-crypto', () => {
  const { createHash, randomUUID } =
    jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: async (_algorithm: string, value: string) =>
      createHash('sha256').update(value).digest('hex'),
    randomUUID,
  };
});

jest.mock('expo-file-system', () => {
  const fs = jest.requireActual<typeof import('node:fs')>('node:fs');
  const path = jest.requireActual<typeof import('node:path')>('node:path');
  const { fileURLToPath, pathToFileURL } =
    jest.requireActual<typeof import('node:url')>('node:url');
  const toPath = (part: string | { uri: string }) => {
    const value = typeof part === 'string' ? part : part.uri;
    return value.startsWith('file:') ? fileURLToPath(value) : value;
  };
  class Directory {
    readonly uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = pathToFileURL(path.join(...parts.map(toPath))).href;
    }
    get exists() {
      return fs.existsSync(toPath(this));
    }
    create() {
      fs.mkdirSync(toPath(this), { recursive: true });
    }
    delete() {
      fs.rmSync(toPath(this), { recursive: true, force: true });
    }
  }
  class File {
    readonly uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = pathToFileURL(path.join(...parts.map(toPath))).href;
    }
    get name() {
      return path.basename(toPath(this));
    }
    get parentDirectory() {
      return new Directory(path.dirname(toPath(this)));
    }
    get exists() {
      return fs.existsSync(toPath(this));
    }
  }
  return {
    Directory,
    File,
    Paths: {
      get cache() {
        return mockCacheDirectory;
      },
    },
  };
});

jest.mock('expo-sqlite', () => {
  const { backup, DatabaseSync: Database } =
    jest.requireActual<typeof import('node:sqlite')>('node:sqlite');
  const path = jest.requireActual<typeof import('node:path')>('node:path');
  const { fileURLToPath } = jest.requireActual<typeof import('node:url')>('node:url');
  return {
    backupDatabaseAsync: async ({
      sourceDatabase,
      destDatabase,
    }: {
      sourceDatabase: { raw: DatabaseSync };
      destDatabase: { path: string };
    }) => backup(sourceDatabase.raw, destDatabase.path),
    openDatabaseAsync: async (name: string, _options: unknown, directory: string) => {
      const file = path.join(fileURLToPath(directory), name);
      const raw = new Database(file);
      return {
        raw,
        path: file,
        execAsync: async (sql: string) => raw.exec(sql),
        runAsync: async (sql: string, ...params: MockSqlParams) =>
          raw.prepare(sql).run(...params.flat()),
        getAllAsync: async (sql: string, ...params: MockSqlParams) =>
          raw.prepare(sql).all(...params.flat()),
        getFirstAsync: async (sql: string, ...params: MockSqlParams) =>
          raw.prepare(sql).get(...params.flat()) ?? null,
        closeAsync: async () => raw.close(),
      };
    },
  };
});

const ALIGNMENT_TAG = '0003_align_agent_fields';

/** The bundle shipped by app versions released before the Agent field alignment. */
function legacyBundle(): MigrationBundle {
  const alignmentIndex = currentBundle.journal.entries.findIndex(
    ({ tag }) => tag === ALIGNMENT_TAG,
  );
  expect(alignmentIndex).toBeGreaterThan(0);
  return {
    ...currentBundle,
    journal: {
      ...currentBundle.journal,
      entries: currentBundle.journal.entries.slice(0, alignmentIndex),
    },
  };
}

/** Builds a database file the way the running app leaves it: migrated, recorded and indexed. */
function createAppDatabase(path: string, bundle: MigrationBundle): DatabaseSync {
  const database = new DatabaseSync(path);
  // Same migration journal as drizzle-orm's SQLite migrator.
  database.exec(`CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at numeric
  )`);
  for (const entry of bundle.journal.entries) {
    const key = `m${String(entry.idx).padStart(4, '0')}` as keyof MigrationBundle['migrations'];
    for (const sql of bundle.migrations[key].split('--> statement-breakpoint')) database.exec(sql);
    database
      .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
      .run('', entry.when);
  }
  for (const sql of customSqlStatements) database.exec(sql);
  return database;
}

async function captureVersion(bundle: MigrationBundle): Promise<BackupDatabaseVersion> {
  mockAppBundle = bundle;
  try {
    return await bundledBackupVersion();
  } finally {
    mockAppBundle = undefined;
  }
}

let workDirectory: string;

beforeEach(() => {
  mockAppBundle = undefined;
  workDirectory = mkdtempSync(join(tmpdir(), 'backup-lineage-work-'));
});

afterEach(() => {
  rmSync(workDirectory, { recursive: true, force: true });
});

afterAll(() => {
  rmSync(mockCacheDirectory, { recursive: true, force: true });
});

test('restores a backup from before the Agent field alignment and upgrades its history', async () => {
  const path = join(workDirectory, 'cherry.db');
  const legacy = createAppDatabase(path, legacyBundle());
  legacy.exec(`
    INSERT INTO agent (id, name, order_key, tool_approval_mode, created_at, updated_at)
    VALUES ('agent', 'Agent', 'a0', 'default', 1, 1);
    INSERT INTO agent_session
      (id, agent_id, name, is_name_manually_edited, last_activity_at, created_at, updated_at)
    VALUES ('session', 'agent', 'Renamed', 1, 1, 1, 1);
  `);
  const parts = [
    { id: 'text', type: 'text', text: 'Hello', state: 'done' },
    {
      id: 'tool',
      type: 'tool',
      toolCallId: 'call',
      toolRef: { source: 'builtin', capabilityId: 'agents' },
      providerName: 'agent_get',
      displayName: 'Get Agent',
      state: 'output-available',
      input: {},
      output: { value: { ok: true }, artifacts: [] },
    },
    {
      id: 'file',
      type: 'file',
      fileEntryId: 'file',
      mediaType: 'image/png',
      name: 'photo.png',
      purpose: 'input-attachment',
    },
    {
      id: 'error',
      type: 'error',
      error: { code: 'EXECUTION_FAILED', message: 'Failed', retryable: false },
    },
  ];
  legacy
    .prepare(
      `INSERT INTO agent_session_message
        (id, session_id, role, data, status, usage, searchable_text, created_at, updated_at)
      VALUES ('message', 'session', 'assistant', ?, 'success', ?, 'Hello', 1, 2)`,
    )
    .run(
      JSON.stringify({ version: 1, parts }),
      JSON.stringify({ inputTokens: 3, outputTokens: 2, totalTokens: 5 }),
    );
  legacy.close();
  const file = new File(path);

  await normalizeBackupDatabase(file, await captureVersion(legacyBundle()));
  await prepareRestoredDatabase(file, []);

  const restored = new DatabaseSync(path);
  try {
    expect(restored.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get()).toEqual({
      count: currentBundle.journal.entries.length,
    });
    const row = restored.prepare('SELECT * FROM agent_session_message').get() as Record<
      string,
      number | string | null
    >;
    const message = toAgentMessageView({
      id: row.id as string,
      sessionId: row.session_id as string,
      parentId: row.parent_id as string | null,
      siblingsGroupId: row.siblings_group_id as number,
      turnId: row.turn_id as string | null,
      role: row.role as string,
      status: row.status as string,
      data: JSON.parse(row.data as string),
      stats: JSON.parse(row.stats as string),
      modelId: null,
      inferenceSnapshot: null,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    });
    expect(message.parts).toEqual([
      parts[0],
      {
        id: 'tool',
        type: 'dynamic-tool',
        toolCallId: 'call',
        toolRef: { source: 'builtin', capabilityId: 'agents' },
        toolName: 'agent_get',
        title: 'Get Agent',
        state: 'output-available',
        input: {},
        output: { value: { ok: true }, artifacts: [] },
      },
      {
        id: 'file',
        type: 'file',
        fileEntryId: 'file',
        mediaType: 'image/png',
        filename: 'photo.png',
        purpose: 'input-attachment',
      },
      {
        id: 'error',
        type: 'data-error',
        data: { code: 'EXECUTION_FAILED', message: 'Failed', retryable: false },
      },
    ]);
    expect(message.stats).toEqual({ inputTokens: 3, outputTokens: 2, totalTokens: 5 });
    expect(
      restored.prepare('SELECT name, is_name_manually_edited FROM agent_session').get(),
    ).toEqual({ name: 'Renamed', is_name_manually_edited: 1 });
    expect(restored.prepare('SELECT tool_approval_mode FROM agent').get()).toEqual({
      tool_approval_mode: 'default',
    });
  } finally {
    restored.close();
  }
});

test('an app released before the Agent field alignment rejects a backup made after it', async () => {
  const path = join(workDirectory, 'cherry.db');
  createAppDatabase(path, currentBundle).close();
  const file = new File(path);
  const version = await captureVersion(currentBundle);

  await expect(normalizeBackupDatabase(file, version)).resolves.toBeUndefined();
  mockAppBundle = legacyBundle();
  await expect(normalizeBackupDatabase(file, version)).rejects.toMatchObject({
    code: 'incompatible',
  });
});

test('operation cleanup removes temporary databases when normalization cleanup fails', async () => {
  const path = join(workDirectory, 'cherry.db');
  createAppDatabase(path, currentBundle).close();
  const version = await captureVersion(currentBundle);
  const cleanup = jest.spyOn(Directory.prototype, 'delete').mockImplementationOnce(() => {
    throw new Error('Temporary database cleanup failed');
  });
  try {
    await expect(normalizeBackupDatabase(new File(path), version)).rejects.toThrow(
      'Temporary database cleanup failed',
    );
  } finally {
    cleanup.mockRestore();
    new Directory(workDirectory).delete();
  }

  expect(readdirSync(mockCacheDirectory)).toEqual([]);
});

test('rebuilds a standard copy, preserving known records and defaulting missing optional columns', async () => {
  const originalPath = join(workDirectory, 'original.db');
  const path = join(workDirectory, 'copy with spaces.db');
  const database = createAppDatabase(originalPath, currentBundle);
  database.exec(`
    INSERT INTO agent (id, name, order_key, tool_approval_mode, created_at, updated_at)
    VALUES ('agent', 'Preserved agent', 'a0', 'ask', 1, 1);
    INSERT INTO agent_session (id, agent_id, last_activity_at, created_at, updated_at)
    VALUES ('session', 'agent', 1, 1, 1);
    INSERT INTO agent_session_message
      (id, session_id, role, data, status, searchable_text, created_at, updated_at)
    VALUES ('message', 'session', 'assistant', '{"parts":[]}', 'success', 'restored search', 1, 1);
    INSERT INTO preference (key, value, created_at, updated_at)
    VALUES ('ui.theme_mode', '"dark"', 1, 1);
    ALTER TABLE agent DROP COLUMN mode;
    ALTER TABLE agent DROP COLUMN avatar;
    ALTER TABLE agent ADD legacy_flag text DEFAULT 'old';
    ALTER TABLE agent ADD replacement_approval text DEFAULT 'old-default' NOT NULL;
    UPDATE agent SET replacement_approval = tool_approval_mode;
    ALTER TABLE agent DROP COLUMN tool_approval_mode;
    ALTER TABLE agent RENAME COLUMN replacement_approval TO TOOL_APPROVAL_MODE;
    DROP INDEX agent_created_at_idx;
    CREATE TABLE legacy_table (value text);
    CREATE INDEX legacy_index ON agent(legacy_flag);
    CREATE TRIGGER legacy_trigger AFTER INSERT ON agent BEGIN DELETE FROM preference; END;
    ALTER TABLE agent RENAME TO renamed_agent;
    ALTER TABLE renamed_agent RENAME TO AGENT;
    DROP TABLE agent_session_message_fts;
  `);
  database.close();
  const original = readFileSync(originalPath);
  copyFileSync(originalPath, path);
  const file = new File(path);
  const version = await captureVersion(currentBundle);

  await normalizeBackupDatabase(file, version);
  const normalized = readFileSync(path);
  await validateBackupDatabase(file, version);
  expect(readFileSync(path)).toEqual(normalized);
  expect(readFileSync(originalPath)).toEqual(original);

  const restored = new DatabaseSync(path);
  try {
    expect(
      restored.prepare('SELECT name, mode, avatar, tool_approval_mode FROM agent').get(),
    ).toEqual({
      name: 'Preserved agent',
      mode: 'standard',
      avatar: null,
      tool_approval_mode: 'ask',
    });
    expect(restored.prepare('PRAGMA table_info(agent)').all()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'legacy_flag' })]),
    );
    expect(
      restored.prepare("SELECT name FROM sqlite_master WHERE name GLOB 'legacy_*'").all(),
    ).toEqual([]);
    expect(
      restored.prepare("SELECT name FROM sqlite_master WHERE name = 'agent_created_at_idx'").get(),
    ).toEqual({ name: 'agent_created_at_idx' });
    expect(restored.prepare('SELECT value FROM preference').get()).toEqual({ value: '"dark"' });
    expect(
      restored
        .prepare(`
      SELECT id FROM agent_session_message
      WHERE fts_rowid IN (SELECT rowid FROM agent_session_message_fts WHERE agent_session_message_fts MATCH 'restored')
    `)
        .all(),
    ).toEqual([{ id: 'message' }]);
    expect(restored.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally {
    restored.close();
  }
});

test.each([
  'ALTER TABLE agent RENAME COLUMN name TO legacy_name',
  'DROP TABLE preference',
  `PRAGMA foreign_keys = OFF;
   INSERT INTO agent_session (id, agent_id, last_activity_at, created_at, updated_at)
   VALUES ('orphan', 'missing-agent', 1, 1, 1)`,
])(
  'rejects missing required data or broken references without replacing the source: %s',
  async (sql) => {
    const path = join(workDirectory, 'cherry.db');
    const database = createAppDatabase(path, currentBundle);
    database.exec(sql);
    database.close();
    const before = readFileSync(path);

    await expect(
      normalizeBackupDatabase(new File(path), await captureVersion(currentBundle)),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(readFileSync(path)).toEqual(before);
  },
);

test('does not skip records that violate the standard constraints', async () => {
  const path = join(workDirectory, 'cherry.db');
  const database = createAppDatabase(path, currentBundle);
  database.exec(`
    PRAGMA ignore_check_constraints = ON;
    INSERT INTO agent (id, name, order_key, created_at, updated_at) VALUES ('agent', 'Agent', 'a0', 1, 1);
    INSERT INTO agent_session (id, agent_id, last_activity_at, created_at, updated_at) VALUES ('session', 'agent', 1, 1, 1);
    INSERT INTO agent_session_message (id, session_id, role, data, status, created_at, updated_at)
    VALUES ('message', 'session', 'unknown-role', '{"parts":[]}', 'success', 1, 1);
  `);
  database.close();
  const before = readFileSync(path);

  await expect(
    normalizeBackupDatabase(new File(path), await captureVersion(currentBundle)),
  ).rejects.toMatchObject({ code: 'invalid' });
  expect(readFileSync(path)).toEqual(before);
});

test.each([
  'DELETE FROM __drizzle_migrations',
  'UPDATE __drizzle_migrations SET created_at = created_at - 1',
  "UPDATE __drizzle_migrations SET hash = 'unexpected'",
])('still rejects a mismatched migration journal: %s', async (sql) => {
  const path = join(workDirectory, 'cherry.db');
  const database = createAppDatabase(path, currentBundle);
  database.exec(sql);
  database.close();
  const before = readFileSync(path);

  await expect(
    normalizeBackupDatabase(new File(path), await captureVersion(currentBundle)),
  ).rejects.toMatchObject({ code: 'incompatible' });
  expect(readFileSync(path)).toEqual(before);
});

test('rejects a different migration lineage before opening the database', async () => {
  const version = await captureVersion(currentBundle);
  version.migrations[0].sha256 = '0'.repeat(64);
  const file = new File(join(workDirectory, 'not-opened.db'));

  await expect(normalizeBackupDatabase(file, version)).rejects.toMatchObject({
    code: 'incompatible',
  });
  expect(file.exists).toBe(false);
});
