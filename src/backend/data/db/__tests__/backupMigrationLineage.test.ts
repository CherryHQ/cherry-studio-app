import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { File } from 'expo-file-system';

import { toAgentMessageView } from '@/backend/data/services/utils/agentSessionRows';

import {
  bundledBackupVersion,
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
  const toPath = (part: string | { uri: string }) => (typeof part === 'string' ? part : part.uri);
  class Directory {
    readonly uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = path.join(...parts.map(toPath));
    }
    get exists() {
      return fs.existsSync(this.uri);
    }
    create() {
      fs.mkdirSync(this.uri, { recursive: true });
    }
    delete() {
      fs.rmSync(this.uri, { recursive: true, force: true });
    }
  }
  class File {
    readonly uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = path.join(...parts.map(toPath));
    }
    get name() {
      return path.basename(this.uri);
    }
    get parentDirectory() {
      return new Directory(path.dirname(this.uri));
    }
    get exists() {
      return fs.existsSync(this.uri);
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
  const { DatabaseSync: Database } =
    jest.requireActual<typeof import('node:sqlite')>('node:sqlite');
  const path = jest.requireActual<typeof import('node:path')>('node:path');
  return {
    openDatabaseAsync: async (name: string, _options: unknown, directory: string) => {
      const raw = new Database(path.join(directory, name));
      return {
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
  // Same DDL as drizzle-orm's SQLite migrator; the backup schema comparison includes it.
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

  await validateBackupDatabase(file, await captureVersion(legacyBundle()));
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

  await expect(validateBackupDatabase(file, version)).resolves.toBeUndefined();
  mockAppBundle = legacyBundle();
  await expect(validateBackupDatabase(file, version)).rejects.toMatchObject({
    code: 'incompatible',
  });
});
