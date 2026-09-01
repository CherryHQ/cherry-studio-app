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
import type {
  AgentErrorView,
  AgentInferenceSnapshotV1,
  AgentSessionView,
} from '@/shared/contracts/agent';

import type { AgentSessionStore } from '../AgentSessionStore';
import { InMemoryAgentSessionStore } from '../InMemoryAgentSessionStore';
import { SqliteAgentSessionStore } from '../SqliteAgentSessionStore';

const INTERRUPTED: AgentErrorView = {
  code: 'INTERRUPTED',
  message: 'restart',
  retryable: true,
};

const MODEL_ID = 'mock-provider::mock-model' as const;
const INPUT_FILE_ID = '00000000-0000-7000-8000-000000000001';
const ARTIFACT_FILE_ID = '00000000-0000-7000-8000-000000000002';
const INFERENCE_SNAPSHOT: AgentInferenceSnapshotV1 = {
  version: 1,
  model: {
    uniqueModelId: MODEL_ID,
    providerId: 'mock-provider',
    modelId: 'mock-model',
    apiModelId: 'mock-model-api',
    name: 'Mock Model',
  },
  reasoningEffort: 'low',
  parameters: { temperature: 0.2, maxOutputTokens: 512 },
  tools: [],
};
const RESERVATION_FACTS = { modelId: MODEL_ID, inferenceSnapshot: INFERENCE_SNAPSHOT };

type StoreHarness = {
  store: AgentSessionStore;
  /** Seeds an empty legacy Session without exposing that operation on the production port. */
  createEmptySession: (input: { agentId: string; title?: string }) => Promise<AgentSessionView>;
  /** Returns an agent id valid for Session creation under this adapter. */
  makeAgentId: () => Promise<string>;
  /** SQLite-only escape hatch for raw assertions; undefined for in-memory. */
  raw?: DatabaseSync;
  cleanup: () => void;
};

function makeInMemoryHarness(): StoreHarness {
  const store = new InMemoryAgentSessionStore();
  return {
    store,
    createEmptySession: (input) => store.createEmptySession(input),
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
  const store = new SqliteAgentSessionStore(dbService);
  return {
    store,
    createEmptySession: (input) => store.createEmptySession(input),
    makeAgentId: async () => {
      const id = randomUUID();
      sqlite
        .prepare(
          `INSERT INTO user_provider (provider_id, name, order_key, created_at, updated_at)
           VALUES ('mock-provider', 'Mock Provider', 'a0', 1, 1)`,
        )
        .run();
      sqlite
        .prepare(
          `INSERT INTO user_model (
            id, provider_id, model_id, name, preset_model_id, order_key, created_at, updated_at
          ) VALUES (?, 'mock-provider', 'mock-model', 'Mock Model', 'mock-model', 'a0', 1, 1)`,
        )
        .run(MODEL_ID);
      sqlite
        .prepare(
          'INSERT INTO agent (id, name, order_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(id, 'Agent', 'a0', Date.now(), Date.now());
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

  test('legacy empty Session lifecycle: seed, get, rename, delete', async () => {
    const created = await harness.createEmptySession({ agentId });
    expect(created.agentId).toBe(agentId);
    expect(created.executionTarget).toEqual({ kind: 'local' });
    expect(created.title).toBe('');
    expect(created.titleIsManual).toBe(false);
    expect(Date.parse(created.createdAt)).not.toBeNaN();

    expect(await store.getSession(created.id)).toEqual(created);
    expect(await store.getSession('missing')).toBeNull();

    const titled = await harness.createEmptySession({ agentId, title: 'Named' });
    expect(titled.title).toBe('Named');
    expect(titled.titleIsManual).toBe(true);

    const renamed = await store.renameSession(created.id, 'My Chat');
    expect(renamed?.title).toBe('My Chat');
    expect(renamed?.titleIsManual).toBe(true);
    expect(await store.renameSession('missing', 'x')).toBeNull();

    const autoNamed = await store.autoRenameSession(titled.id, 'Named', 'Summary');
    expect(autoNamed).toBeNull();

    const autoTitle = await harness.createEmptySession({ agentId });
    const firstTitle = await store.autoRenameSession(autoTitle.id, '', 'First message');
    expect(firstTitle?.title).toBe('First message');
    expect(firstTitle?.titleIsManual).toBe(false);
    expect(await store.autoRenameSession(autoTitle.id, '', 'Stale write')).toBeNull();

    expect(await store.deleteSession(created.id)).toBe(true);
    expect(await store.deleteSession(created.id)).toBe(false);
    expect(await store.getSession(created.id)).toBeNull();
  });

  test('reserveSubmission writes the correlated user/assistant pair', async () => {
    const session = await harness.createEmptySession({ agentId });
    const reserved = await store.reserveSubmission({
      ...RESERVATION_FACTS,
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
    expect(reserved.userMessage.modelId).toBeNull();
    expect(reserved.userMessage.inferenceSnapshot).toBeNull();
    expect(reserved.assistantMessage.role).toBe('assistant');
    expect(reserved.assistantMessage.status).toBe('pending');
    expect(reserved.assistantMessage.parts).toEqual([]);
    expect(reserved.assistantMessage.modelId).toBe(MODEL_ID);
    expect(reserved.assistantMessage.inferenceSnapshot).toEqual({
      status: 'supported',
      snapshot: INFERENCE_SNAPSHOT,
    });

    expect(await store.listMessages(session.id)).toEqual([
      reserved.userMessage,
      reserved.assistantMessage,
    ]);
    await expect(
      store.reserveSubmission({ ...RESERVATION_FACTS, sessionId: 'missing', userParts: [] }),
    ).rejects.toThrow();
  });

  test('reserveInitialSubmission atomically creates the Session and first message pair', async () => {
    const reserved = await store.reserveInitialSubmission({
      ...RESERVATION_FACTS,
      agentId,
      executionTarget: { kind: 'local' },
      userParts: [{ id: 'input-0', type: 'text', text: 'Hello.', state: 'done' }],
    });

    expect(await store.getSession(reserved.session.id)).toEqual(reserved.session);
    expect(await store.listMessages(reserved.session.id)).toEqual([
      reserved.userMessage,
      reserved.assistantMessage,
    ]);
    expect(reserved.userMessage.sessionId).toBe(reserved.session.id);
    expect(reserved.assistantMessage.sessionId).toBe(reserved.session.id);
  });

  test('finalizeAssistantMessage settles status, parts, usage, and turn error', async () => {
    const session = await harness.createEmptySession({ agentId });
    const reserved = await store.reserveSubmission({
      ...RESERVATION_FACTS,
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
      contextCheckpoint: {
        version: 1,
        anchorTurnId: reserved.turnId,
        payload: { mustNotPersist: true },
      },
    });

    expect(finalized.status).toBe('error');
    expect(finalized.parts).toHaveLength(2);
    expect(finalized.usage).toEqual({ inputTokens: 3, outputTokens: 2, totalTokens: 5 });
    expect(finalized.modelId).toBe(MODEL_ID);
    expect(finalized.inferenceSnapshot).toEqual(reserved.assistantMessage.inferenceSnapshot);

    const transcript = await store.listMessages(session.id);
    expect(transcript[1]).toEqual(finalized);
    expect(await store.getLatestContextCheckpoint(session.id)).toBeNull();
    await expect(
      store.finalizeAssistantMessage({
        assistantMessageId: 'missing',
        status: 'success',
        parts: [],
        usage: null,
        error: null,
        contextCheckpoint: null,
      }),
    ).rejects.toThrow();
  });

  test('transcript accumulates across settled turns in order', async () => {
    const session = await harness.createEmptySession({ agentId });
    for (const text of ['one', 'two']) {
      const reserved = await store.reserveSubmission({
        ...RESERVATION_FACTS,
        sessionId: session.id,
        userParts: [{ id: 'input-0', type: 'text', text, state: 'done' }],
      });
      await store.finalizeAssistantMessage({
        assistantMessageId: reserved.assistantMessage.id,
        status: 'success',
        parts: [{ id: 'text-1', type: 'text', text: `re: ${text}`, state: 'done' }],
        usage: null,
        error: null,
        contextCheckpoint: null,
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

  test('forkSession copies the transcript up to the fork point into an idle Session', async () => {
    const source = await harness.createEmptySession({ agentId, title: 'Maths' });
    for (const text of ['one', 'two', 'three']) {
      const reserved = await store.reserveSubmission({
        ...RESERVATION_FACTS,
        sessionId: source.id,
        userParts: [{ id: 'input-0', type: 'text', text, state: 'done' }],
      });
      await store.finalizeAssistantMessage({
        assistantMessageId: reserved.assistantMessage.id,
        status: 'success',
        parts: [{ id: 'text-1', type: 'text', text: `re: ${text}`, state: 'done' }],
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        error: null,
        contextCheckpoint: { version: 1, anchorTurnId: reserved.turnId, payload: 'ctx' },
      });
    }
    const original = await store.listMessages(source.id);
    const forkPoint = original[3];

    const result = await store.forkSession({
      sessionId: source.id,
      fromMessageId: forkPoint.id,
    });

    expect(result.status).toBe('forked');
    if (result.status !== 'forked') return;
    const fork = result.session;
    expect(fork.id).not.toBe(source.id);
    expect(fork.agentId).toBe(source.agentId);
    expect(fork.executionTarget).toEqual(source.executionTarget);
    // Without an override the fork inherits the conversation's name; any
    // derived wording is the client's to compose, not the store's.
    expect(fork.title).toBe('Maths');
    expect(fork.titleIsManual).toBe(true);
    expect(fork.forkedFromSessionId).toBe(source.id);
    expect(await store.getSession(fork.id)).toEqual(fork);

    const copied = await store.listMessages(fork.id);
    expect(copied.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
    expect(copied.map((message) => message.status)).toEqual([
      'success',
      'success',
      'success',
      'success',
    ]);
    // Rule 3: copied history keeps its parts verbatim, tool records included.
    expect(copied.map((message) => message.parts)).toEqual(
      original.slice(0, 4).map((message) => message.parts),
    );
    // Historical facts travel with the copy.
    expect(copied[1]?.usage).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3 });
    expect(copied[1]?.modelId).toBe(MODEL_ID);
    expect(copied[1]?.inferenceSnapshot).toEqual({
      status: 'supported',
      snapshot: INFERENCE_SNAPSHOT,
    });
    // The copy presents the same history, so the rows keep their original time.
    expect(copied.map((message) => message.createdAt)).toEqual(
      original.slice(0, 4).map((message) => message.createdAt),
    );

    // Nothing is shared with the source: fresh message ids, reissued turn ids,
    // and the pairing within each submission still holds.
    const sourceIds = new Set(original.map((message) => message.id));
    expect(copied.some((message) => sourceIds.has(message.id))).toBe(false);
    expect(copied.every((message) => message.sessionId === fork.id)).toBe(true);
    expect(copied[0]?.turnId).toBe(copied[1]?.turnId);
    expect(copied[2]?.turnId).toBe(copied[3]?.turnId);
    expect(copied[0]?.turnId).not.toBe(copied[2]?.turnId);
    const sourceTurnIds = new Set(original.map((message) => message.turnId));
    expect(copied.some((message) => sourceTurnIds.has(message.turnId))).toBe(false);

    // The fork starts idle: no checkpoint anchors into a turn it never ran.
    expect(await store.getLatestContextCheckpoint(fork.id)).toBeNull();
    // The source is untouched.
    expect(await store.listMessages(source.id)).toEqual(original);
  });

  test('forkSession names the copy from the caller when one is supplied', async () => {
    const source = await harness.createEmptySession({ agentId, title: 'Maths' });
    const reserved = await store.reserveSubmission({
      ...RESERVATION_FACTS,
      sessionId: source.id,
      userParts: [{ id: 'input-0', type: 'text', text: 'one', state: 'done' }],
    });

    const result = await store.forkSession({
      sessionId: source.id,
      fromMessageId: reserved.userMessage.id,
      title: 'Branch - Maths',
    });

    expect(result.status).toBe('forked');
    if (result.status !== 'forked') return;
    expect(result.session.title).toBe('Branch - Maths');
    // Renaming the copy must not touch the Session it was copied from.
    expect((await store.getSession(source.id))?.title).toBe('Maths');
  });

  test('forkSession refuses an unknown session, a foreign anchor, and an unsettled fork point', async () => {
    const source = await harness.createEmptySession({ agentId });
    const other = await harness.createEmptySession({ agentId });
    const reserved = await store.reserveSubmission({
      ...RESERVATION_FACTS,
      sessionId: source.id,
      userParts: [{ id: 'input-0', type: 'text', text: 'one', state: 'done' }],
    });

    expect(
      await store.forkSession({ sessionId: 'missing', fromMessageId: reserved.userMessage.id }),
    ).toEqual({ status: 'session-not-found' });
    expect(await store.forkSession({ sessionId: source.id, fromMessageId: 'missing' })).toEqual({
      status: 'message-not-found',
    });
    // A message id is only a fork point inside the Session that owns it.
    expect(
      await store.forkSession({ sessionId: other.id, fromMessageId: reserved.userMessage.id }),
    ).toEqual({ status: 'message-not-found' });
    // Refused, not silently truncated to the message before it.
    expect(
      await store.forkSession({
        sessionId: source.id,
        fromMessageId: reserved.assistantMessage.id,
      }),
    ).toEqual({ status: 'fork-point-unsettled' });
  });

  test('loads a checkpoint tail separately from full-transcript authorization indexes', async () => {
    const session = await harness.createEmptySession({ agentId });
    const first = await store.reserveSubmission({
      ...RESERVATION_FACTS,
      sessionId: session.id,
      userParts: [
        {
          fileEntryId: INPUT_FILE_ID,
          id: 'input-0',
          mediaType: 'image/png',
          name: 'input.png',
          purpose: 'input-attachment',
          type: 'file',
        },
      ],
    });
    await store.finalizeAssistantMessage({
      assistantMessageId: first.assistantMessage.id,
      status: 'success',
      parts: [
        {
          fileEntryId: ARTIFACT_FILE_ID,
          id: 'artifact-0',
          mediaType: 'text/plain',
          name: 'result.txt',
          purpose: 'artifact',
          type: 'file',
        },
      ],
      usage: null,
      error: null,
      contextCheckpoint: null,
    });
    const second = await store.reserveSubmission({
      ...RESERVATION_FACTS,
      sessionId: session.id,
      userParts: [{ id: 'input-0', type: 'text', text: 'two', state: 'done' }],
    });
    await store.finalizeAssistantMessage({
      assistantMessageId: second.assistantMessage.id,
      status: 'success',
      parts: [],
      usage: null,
      error: null,
      contextCheckpoint: null,
    });

    const tail = await store.loadRuntimeTurnContext(session.id, first.turnId);

    expect(tail).toMatchObject({
      anchorFound: true,
      hasMessages: true,
      referencedFileEntryIds: expect.arrayContaining([INPUT_FILE_ID, ARTIFACT_FILE_ID]),
      sessionTurnIds: expect.arrayContaining([first.turnId, second.turnId]),
    });
    expect(tail.history.map((message) => message.turnId)).toEqual([second.turnId, second.turnId]);

    const missingAnchor = await store.loadRuntimeTurnContext(session.id, 'missing-turn');
    expect(missingAnchor.anchorFound).toBe(false);
    expect(missingAnchor.history).toHaveLength(4);
  });

  test('stores a checkpoint on the assistant terminal write and reads the newest candidate', async () => {
    const session = await harness.createEmptySession({ agentId });
    const first = await store.reserveSubmission({
      ...RESERVATION_FACTS,
      sessionId: session.id,
      userParts: [{ id: 'input-0', type: 'text', text: 'one', state: 'done' }],
    });
    const checkpoint = {
      version: 1 as const,
      anchorTurnId: first.turnId,
      payload: { summary: 'one' },
    };
    await store.finalizeAssistantMessage({
      assistantMessageId: first.assistantMessage.id,
      status: 'success',
      parts: [],
      usage: null,
      error: null,
      contextCheckpoint: checkpoint,
    });

    expect(await store.getLatestContextCheckpoint(session.id)).toEqual({
      assistantMessageId: first.assistantMessage.id,
      checkpoint,
    });
    expect(await store.getLatestContextCheckpoint('missing')).toBeNull();
  });

  test('reconcileInterrupted settles unsettled assistant placeholders once', async () => {
    const session = await harness.createEmptySession({ agentId });
    await store.reserveSubmission({
      ...RESERVATION_FACTS,
      sessionId: session.id,
      userParts: [{ id: 'input-0', type: 'text', text: 'Hello.', state: 'done' }],
    });

    expect(await store.reconcileInterrupted(INTERRUPTED)).toBe(1);
    const transcript = await store.listMessages(session.id);
    expect(transcript.map((message) => message.status)).toEqual(['success', 'interrupted']);
    expect(transcript[1]?.modelId).toBe(MODEL_ID);
    expect(transcript[1]?.inferenceSnapshot).toEqual({
      status: 'supported',
      snapshot: INFERENCE_SNAPSHOT,
    });

    expect(await store.reconcileInterrupted(INTERRUPTED)).toBe(0);
  });

  test('deleteSession removes the transcript with the session', async () => {
    const session = await harness.createEmptySession({ agentId });
    await store.reserveSubmission({
      ...RESERVATION_FACTS,
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

  test('rolls back the Session when its initial message reservation fails', async () => {
    const { store, raw } = harness;
    if (!raw) throw new Error('sqlite harness provides raw access');
    const agentId = await harness.makeAgentId();

    await expect(
      store.reserveInitialSubmission({
        ...RESERVATION_FACTS,
        agentId,
        executionTarget: { kind: 'local' },
        modelId: 'missing-provider::missing-model',
        userParts: [{ id: 'input-0', type: 'text', text: 'Hello.', state: 'done' }],
      }),
    ).rejects.toThrow();

    expect(
      raw.prepare('SELECT COUNT(*) AS count FROM agent_session').get() as { count: number },
    ).toEqual({ count: 0 });
  });

  test('the invariant-1 index rejects a second reservation while one is unsettled', async () => {
    const { store } = harness;
    const agentId = await harness.makeAgentId();
    const session = await harness.createEmptySession({ agentId });
    const first = await store.reserveSubmission({
      ...RESERVATION_FACTS,
      sessionId: session.id,
      userParts: [{ id: 'input-0', type: 'text', text: 'one', state: 'done' }],
    });

    // The proxy driver wraps the SQLITE_CONSTRAINT_UNIQUE error; the rollback
    // and post-settle assertions below pin that the unique index caused it.
    await expect(
      store.reserveSubmission({
        ...RESERVATION_FACTS,
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
      contextCheckpoint: null,
    });
    await expect(
      store.reserveSubmission({
        ...RESERVATION_FACTS,
        sessionId: session.id,
        userParts: [{ id: 'input-0', type: 'text', text: 'two', state: 'done' }],
      }),
    ).resolves.toBeDefined();
  });

  test('FTS triggers index text parts on insert and settle', async () => {
    const { store, raw } = harness;
    if (!raw) throw new Error('sqlite harness provides raw access');
    const agentId = await harness.makeAgentId();
    const session = await harness.createEmptySession({ agentId });
    const reserved = await store.reserveSubmission({
      ...RESERVATION_FACTS,
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
      contextCheckpoint: null,
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

  test('a fork indexes its copied rows and outlives the source it cites', async () => {
    const { store, raw } = harness;
    if (!raw) throw new Error('sqlite harness provides raw access');
    const agentId = await harness.makeAgentId();
    const source = await harness.createEmptySession({ agentId });
    const reserved = await store.reserveSubmission({
      ...RESERVATION_FACTS,
      sessionId: source.id,
      userParts: [{ id: 'input-0', type: 'text', text: 'quantum sailboat', state: 'done' }],
    });
    await store.finalizeAssistantMessage({
      assistantMessageId: reserved.assistantMessage.id,
      status: 'success',
      parts: [{ id: 't-1', type: 'text', text: 'emerald harbor', state: 'done' }],
      usage: null,
      error: null,
      contextCheckpoint: null,
    });

    const result = await store.forkSession({
      sessionId: source.id,
      fromMessageId: reserved.assistantMessage.id,
    });
    expect(result.status).toBe('forked');
    if (result.status !== 'forked') return;

    // The AFTER INSERT trigger has to run for every row the copy writes, not
    // just the first: fts_rowid is assigned as MAX+1 per insert.
    const matches = raw
      .prepare(
        `SELECT m.session_id AS sessionId FROM agent_session_message m
         JOIN agent_session_message_fts fts ON m.fts_rowid = fts.rowid
         WHERE agent_session_message_fts MATCH ?
         ORDER BY m.created_at, m.id`,
      )
      .all('harbor') as { sessionId: string }[];
    expect(matches.map((row) => row.sessionId).sort()).toEqual(
      [source.id, result.session.id].sort(),
    );
    expect(
      (
        raw
          .prepare('SELECT COUNT(DISTINCT fts_rowid) AS count FROM agent_session_message')
          .get() as {
          count: number;
        }
      ).count,
    ).toBe(4);

    // Deleting the source drops the lineage claim, never the fork itself.
    expect(await store.deleteSession(source.id)).toBe(true);
    expect(await store.getSession(result.session.id)).toEqual(
      expect.objectContaining({ forkedFromSessionId: null, id: result.session.id }),
    );
    expect(await store.listMessages(result.session.id)).toHaveLength(2);
  });

  test('turn-level error and activity time persist on the rows', async () => {
    const { store, raw } = harness;
    if (!raw) throw new Error('sqlite harness provides raw access');
    const agentId = await harness.makeAgentId();
    const session = await harness.createEmptySession({ agentId });
    const reserved = await store.reserveSubmission({
      ...RESERVATION_FACTS,
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

  test('returns a corrupt checkpoint candidate for Host-side classification', async () => {
    const { store, raw } = harness;
    if (!raw) throw new Error('sqlite harness provides raw access');
    const agentId = await harness.makeAgentId();
    const session = await harness.createEmptySession({ agentId });
    const reserved = await store.reserveSubmission({
      ...RESERVATION_FACTS,
      sessionId: session.id,
      userParts: [{ id: 'input-0', type: 'text', text: 'x', state: 'done' }],
    });
    await store.finalizeAssistantMessage({
      assistantMessageId: reserved.assistantMessage.id,
      status: 'success',
      parts: [],
      usage: null,
      error: null,
      contextCheckpoint: null,
    });
    raw
      .prepare('UPDATE agent_session_message SET context_checkpoint = ? WHERE id = ?')
      .run('not-json', reserved.assistantMessage.id);

    await expect(store.getLatestContextCheckpoint(session.id)).resolves.toEqual({
      assistantMessageId: reserved.assistantMessage.id,
      checkpoint: 'not-json',
    });
  });

  test('keeps the inference snapshot after its selected model is deleted', async () => {
    const { store, raw } = harness;
    if (!raw) throw new Error('sqlite harness provides raw access');
    const agentId = await harness.makeAgentId();
    const session = await harness.createEmptySession({ agentId });
    const reserved = await store.reserveSubmission({
      ...RESERVATION_FACTS,
      sessionId: session.id,
      userParts: [{ id: 'input-0', type: 'text', text: 'Remember the model.', state: 'done' }],
    });

    raw.prepare("DELETE FROM user_provider WHERE provider_id = 'mock-provider'").run();

    const assistant = (await store.listMessages(session.id))[1];
    expect(assistant?.modelId).toBeNull();
    expect(assistant?.inferenceSnapshot).toEqual(reserved.assistantMessage.inferenceSnapshot);
  });

  test('reconciliation atomically terminalizes persisted non-terminal tool parts', async () => {
    const { store, raw } = harness;
    if (!raw) throw new Error('sqlite harness provides raw access');
    const agentId = await harness.makeAgentId();
    const session = await harness.createEmptySession({ agentId });
    const reserved = await store.reserveSubmission({
      ...RESERVATION_FACTS,
      sessionId: session.id,
      userParts: [{ id: 'input-0', type: 'text', text: 'Use the tool.', state: 'done' }],
    });
    raw.prepare('UPDATE agent_session_message SET data = ?, status = ? WHERE id = ?').run(
      JSON.stringify({
        version: 1,
        parts: [
          {
            id: 'tool-1',
            type: 'tool',
            toolCallId: 'call-1',
            toolRef: { source: 'mcp', serverId: 'server-1', rawToolName: 'search' },
            providerName: 'mcp_server_1_search_a1b2',
            displayName: 'Search',
            state: 'awaiting-approval',
            input: { query: 'Cherry Studio' },
            approvalId: 'approval-1',
          },
        ],
      }),
      'streaming',
      reserved.assistantMessage.id,
    );

    expect(await store.reconcileInterrupted(INTERRUPTED)).toBe(1);

    const assistant = (await store.listMessages(session.id))[1];
    expect(assistant).toMatchObject({
      status: 'interrupted',
      parts: [
        {
          id: 'tool-1',
          state: 'interrupted',
          output: {
            value: { status: 'interrupted', reason: INTERRUPTED.message },
            artifacts: [],
          },
        },
      ],
    });
    expect(assistant?.parts[0]).not.toHaveProperty('approvalId');
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
 * the proxy answers in both shapes at once.
 */
function hybridRow(row: Record<string, unknown>): unknown[] {
  return Object.assign(Object.values(row), row);
}
