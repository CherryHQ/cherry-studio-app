/**
 * Store conformance suite: every {@link AgentSessionStore} adapter must expose
 * the same message-centric behavior (agent-persistence.md), so the suite runs
 * against the process-local reference adapter and the durable SQLite adapter
 * over a real migrated database. Database-only guarantees (the invariant-1
 * partial unique index, cascades, FTS triggers) are asserted on the SQLite
 * harness alone.
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { drizzle } from 'drizzle-orm/sqlite-proxy';

import { customSqlStatements } from '@/backend/data/db/customSql';
import type { Database, DbService } from '@/backend/data/db/DbService';
import { schema } from '@/backend/data/db/schemas';
import type { AgentErrorView } from '@/shared/contracts/agent';

import type { AgentSessionStore } from '../AgentSessionStore';
import { InMemoryAgentSessionStore } from '../InMemoryAgentSessionStore';
import { SqliteAgentSessionStore } from '../SqliteAgentSessionStore';

const INTERRUPTED: AgentErrorView = {
  code: 'INTERRUPTED',
  message: 'restart',
  retryable: true,
};

type StoreHarness = {
  store: AgentSessionStore;
  /** Returns an agent id valid for createSession under this adapter. */
  makeAgentId: () => Promise<string>;
  /** SQLite-only escape hatch for raw assertions; undefined for in-memory. */
  raw?: DatabaseSync;
  cleanup: () => void;
};

function makeInMemoryHarness(): StoreHarness {
  const store = new InMemoryAgentSessionStore();
  return {
    store,
    makeAgentId: async () => randomUUID(),
    cleanup: () => {},
  };
}

function makeSqliteHarness(): StoreHarness {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyMigrations(sqlite);
  for (const statement of customSqlStatements) {
    sqlite.exec(statement);
  }
  const database = drizzle(
    async (sql, params, method) => {
      const statement = sqlite.prepare(sql);
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
  let writeTail: Promise<void> = Promise.resolve();
  const dbService = {
    getDb: () => database,
    withWriteTx: async <T>(callback: (tx: Database) => Promise<T>) => {
      const previous = writeTail;
      let release: () => void = () => undefined;
      writeTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = await callback(database);
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      } finally {
        release();
      }
    },
  } as unknown as DbService;
  return {
    store: new SqliteAgentSessionStore(dbService),
    makeAgentId: async () => {
      const id = randomUUID();
      sqlite
        .prepare(
          'INSERT INTO agent (id, name, settings, order_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(id, 'Agent', '{}', 'a0', Date.now(), Date.now());
      return id;
    },
    raw: sqlite,
    cleanup: () => sqlite.close(),
  };
}

describe.each([
  ['InMemoryAgentSessionStore', makeInMemoryHarness],
  ['SqliteAgentSessionStore', makeSqliteHarness],
])('%s conformance', (_name, makeHarness) => {
  let harness: StoreHarness;
  let store: AgentSessionStore;
  let agentId: string;

  beforeEach(async () => {
    harness = makeHarness();
    store = harness.store;
    agentId = await harness.makeAgentId();
  });

  afterEach(() => {
    harness.cleanup();
  });

  test('session lifecycle: create, get, rename, delete', async () => {
    const created = await store.createSession({ agentId });
    expect(created.agentId).toBe(agentId);
    expect(created.executionTarget).toEqual({ kind: 'local' });
    expect(created.title).toBe('');
    expect(created.titleIsManual).toBe(false);
    expect(Date.parse(created.createdAt)).not.toBeNaN();

    expect(await store.getSession(created.id)).toEqual(created);
    expect(await store.getSession('missing')).toBeNull();

    const titled = await store.createSession({ agentId, title: 'Named' });
    expect(titled.title).toBe('Named');
    expect(titled.titleIsManual).toBe(true);

    const renamed = await store.renameSession(created.id, 'My Chat');
    expect(renamed?.title).toBe('My Chat');
    expect(renamed?.titleIsManual).toBe(true);
    expect(await store.renameSession('missing', 'x')).toBeNull();

    expect(await store.deleteSession(created.id)).toBe(true);
    expect(await store.deleteSession(created.id)).toBe(false);
    expect(await store.getSession(created.id)).toBeNull();
  });

  test('reserveSubmission writes the correlated user/assistant pair', async () => {
    const session = await store.createSession({ agentId });
    const reserved = await store.reserveSubmission({
      sessionId: session.id,
      userParts: [{ id: 'input-0', type: 'text', text: 'Hello.', state: 'done' }],
    });

    expect(reserved.userMessage.turnId).toBe(reserved.turnId);
    expect(reserved.assistantMessage.turnId).toBe(reserved.turnId);
    expect(reserved.userMessage.role).toBe('user');
    expect(reserved.userMessage.status).toBe('success');
    expect(reserved.userMessage.parts).toEqual([
      { id: 'input-0', type: 'text', text: 'Hello.', state: 'done' },
    ]);
    expect(reserved.assistantMessage.role).toBe('assistant');
    expect(reserved.assistantMessage.status).toBe('pending');
    expect(reserved.assistantMessage.parts).toEqual([]);

    expect(await store.listMessages(session.id)).toEqual([
      reserved.userMessage,
      reserved.assistantMessage,
    ]);
    await expect(
      store.reserveSubmission({ sessionId: 'missing', userParts: [] }),
    ).rejects.toThrow();
  });

  test('finalizeAssistantMessage settles status, parts, usage, and turn error', async () => {
    const session = await store.createSession({ agentId });
    const reserved = await store.reserveSubmission({
      sessionId: session.id,
      userParts: [{ id: 'input-0', type: 'text', text: 'Hi', state: 'done' }],
    });

    const finalized = await store.finalizeAssistantMessage({
      assistantMessageId: reserved.assistantMessage.id,
      status: 'error',
      parts: [
        { id: 'text-1', type: 'text', text: 'Partial', state: 'done' },
        { id: 'error-1', type: 'error', error: { ...INTERRUPTED, code: 'EXECUTION_FAILED' } },
      ],
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
      error: { ...INTERRUPTED, code: 'EXECUTION_FAILED' },
    });

    expect(finalized.status).toBe('error');
    expect(finalized.parts).toHaveLength(2);
    expect(finalized.usage).toEqual({ inputTokens: 3, outputTokens: 2, totalTokens: 5 });

    const transcript = await store.listMessages(session.id);
    expect(transcript[1]).toEqual(finalized);
    await expect(
      store.finalizeAssistantMessage({
        assistantMessageId: 'missing',
        status: 'success',
        parts: [],
        usage: null,
        error: null,
      }),
    ).rejects.toThrow();
  });

  test('transcript accumulates across settled turns in order', async () => {
    const session = await store.createSession({ agentId });
    for (const text of ['one', 'two']) {
      const reserved = await store.reserveSubmission({
        sessionId: session.id,
        userParts: [{ id: 'input-0', type: 'text', text, state: 'done' }],
      });
      await store.finalizeAssistantMessage({
        assistantMessageId: reserved.assistantMessage.id,
        status: 'success',
        parts: [{ id: 'text-1', type: 'text', text: `re: ${text}`, state: 'done' }],
        usage: null,
        error: null,
      });
    }

    const transcript = await store.listMessages(session.id);
    expect(transcript.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
    expect(transcript.map((message) => message.status)).toEqual([
      'success',
      'success',
      'success',
      'success',
    ]);
    // One turnId per submission, shared within the pair.
    expect(transcript[0]?.turnId).toBe(transcript[1]?.turnId);
    expect(transcript[2]?.turnId).toBe(transcript[3]?.turnId);
    expect(transcript[0]?.turnId).not.toBe(transcript[2]?.turnId);
  });

  test('reconcileInterrupted settles unsettled assistant placeholders once', async () => {
    const session = await store.createSession({ agentId });
    await store.reserveSubmission({
      sessionId: session.id,
      userParts: [{ id: 'input-0', type: 'text', text: 'Hello.', state: 'done' }],
    });

    expect(await store.reconcileInterrupted(INTERRUPTED)).toBe(1);
    const transcript = await store.listMessages(session.id);
    expect(transcript.map((message) => message.status)).toEqual(['success', 'interrupted']);

    expect(await store.reconcileInterrupted(INTERRUPTED)).toBe(0);
  });

  test('deleteSession removes the transcript with the session', async () => {
    const session = await store.createSession({ agentId });
    await store.reserveSubmission({
      sessionId: session.id,
      userParts: [{ id: 'input-0', type: 'text', text: 'Hello.', state: 'done' }],
    });

    expect(await store.deleteSession(session.id)).toBe(true);
    expect(await store.listMessages(session.id)).toEqual([]);
  });
});

describe('SqliteAgentSessionStore database guarantees', () => {
  let harness: StoreHarness;

  beforeEach(() => {
    harness = makeSqliteHarness();
  });

  afterEach(() => {
    harness.cleanup();
  });

  test('the invariant-1 index rejects a second reservation while one is unsettled', async () => {
    const { store } = harness;
    const agentId = await harness.makeAgentId();
    const session = await store.createSession({ agentId });
    const first = await store.reserveSubmission({
      sessionId: session.id,
      userParts: [{ id: 'input-0', type: 'text', text: 'one', state: 'done' }],
    });

    // The proxy driver wraps the SQLITE_CONSTRAINT_UNIQUE error; the rollback
    // and post-settle assertions below pin that the unique index caused it.
    await expect(
      store.reserveSubmission({
        sessionId: session.id,
        userParts: [{ id: 'input-0', type: 'text', text: 'two', state: 'done' }],
      }),
    ).rejects.toThrow();
    // The failed reservation rolled back whole: no orphan user message.
    expect((await store.listMessages(session.id)).map((message) => message.role)).toEqual([
      'user',
      'assistant',
    ]);

    await store.finalizeAssistantMessage({
      assistantMessageId: first.assistantMessage.id,
      status: 'success',
      parts: [],
      usage: null,
      error: null,
    });
    await expect(
      store.reserveSubmission({
        sessionId: session.id,
        userParts: [{ id: 'input-0', type: 'text', text: 'two', state: 'done' }],
      }),
    ).resolves.toBeDefined();
  });

  test('FTS triggers index text parts on insert and settle', async () => {
    const { store, raw } = harness;
    if (!raw) throw new Error('sqlite harness provides raw access');
    const agentId = await harness.makeAgentId();
    const session = await store.createSession({ agentId });
    const reserved = await store.reserveSubmission({
      sessionId: session.id,
      userParts: [{ id: 'input-0', type: 'text', text: 'quantum sailboat', state: 'done' }],
    });
    await store.finalizeAssistantMessage({
      assistantMessageId: reserved.assistantMessage.id,
      status: 'success',
      parts: [
        { id: 'r-1', type: 'reasoning', text: 'hidden reasoning', state: 'done' },
        { id: 't-1', type: 'text', text: 'emerald harbor', state: 'done' },
      ],
      usage: null,
      error: null,
    });

    const search = (term: string) =>
      raw
        .prepare(
          `SELECT m.id FROM agent_session_message m
           JOIN agent_session_message_fts fts ON m.fts_rowid = fts.rowid
           WHERE agent_session_message_fts MATCH ?`,
        )
        .all(term) as { id: string }[];

    expect(search('sailboat').map((row) => row.id)).toEqual([reserved.userMessage.id]);
    expect(search('harbor').map((row) => row.id)).toEqual([reserved.assistantMessage.id]);
    // Reasoning stays out of the search index by design.
    expect(search('hidden')).toEqual([]);
  });

  test('turn-level error and activity time persist on the rows', async () => {
    const { store, raw } = harness;
    if (!raw) throw new Error('sqlite harness provides raw access');
    const agentId = await harness.makeAgentId();
    const session = await store.createSession({ agentId });
    const reserved = await store.reserveSubmission({
      sessionId: session.id,
      userParts: [{ id: 'input-0', type: 'text', text: 'x', state: 'done' }],
    });
    await store.reconcileInterrupted(INTERRUPTED);

    const row = raw
      .prepare('SELECT error FROM agent_session_message WHERE id = ?')
      .get(reserved.assistantMessage.id) as { error: string };
    expect(JSON.parse(row.error)).toEqual(INTERRUPTED);

    const sessionRow = raw
      .prepare('SELECT last_activity_at FROM agent_session WHERE id = ?')
      .get(session.id) as { last_activity_at: number };
    expect(sessionRow.last_activity_at).toBeGreaterThan(0);
  });
});

type MigrationJournal = { entries: { tag: string }[] };

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

/**
 * Positional for drizzle's column mapper, named for raw `db.all` fallbacks —
 * the proxy answers in both shapes at once (see MessageService.integration).
 */
function hybridRow(row: Record<string, unknown>): unknown[] {
  return Object.assign(Object.values(row), row);
}
