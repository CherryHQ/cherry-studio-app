import { DatabaseSync } from 'node:sqlite';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';

import { agentSessionMessageService } from '../AgentSessionMessageService';
import { createTestDb, type TestDb } from './_testDb';

describe('AgentSessionMessageService persistence', () => {
  let sqlite: DatabaseSync;
  let testDb: TestDb;

  beforeEach(async () => {
    sqlite = new DatabaseSync(':memory:');
    testDb = createTestDb(sqlite);
    await installTestHost({ DbService: testDb.dbService });
    sqlite
      .prepare(
        `INSERT INTO agent (id, name, order_key, created_at, updated_at)
         VALUES ('agent-1', 'Agent', 'a0', 1, 1)`,
      )
      .run();
    insertSession(sqlite, 'session-1');
  });

  afterEach(async () => {
    await uninstallTestHost();
    sqlite.close();
  });

  test('pages the linear transcript newest-first with a stable tie-breaker', async () => {
    insertMessage(sqlite, { createdAt: 100, id: 'message-a', text: 'A' });
    insertMessage(sqlite, { createdAt: 300, id: 'message-b', text: 'B' });
    insertMessage(sqlite, { createdAt: 300, id: 'message-c', text: 'C' });

    const first = await agentSessionMessageService.listByCursor('session-1', { limit: 2 });
    expect(first.items.map((message) => message.id)).toEqual(['message-c', 'message-b']);
    expect(first.items[0]).toMatchObject({
      inferenceSnapshot: null,
      modelId: null,
      parts: [{ state: 'done', text: 'C', type: 'text' }],
      sessionId: 'session-1',
      stats: {
        runtimeTiming: { startedAt: 300, completedAt: 300, spans: [] },
      },
      status: 'success',
    });

    const second = await agentSessionMessageService.listByCursor('session-1', {
      cursor: first.nextCursor,
      limit: 2,
    });
    expect(second.items.map((message) => message.id)).toEqual(['message-a']);
    expect(second.nextCursor).toBeUndefined();
  });

  test('distinguishes an empty transcript from an unknown session', async () => {
    await expect(agentSessionMessageService.listByCursor('session-1')).resolves.toEqual({
      items: [],
    });
    await expect(agentSessionMessageService.listByCursor('missing')).rejects.toMatchObject({
      details: { id: 'missing', resource: 'AgentSession' },
    });
  });

  test('opens around a message and pages both ways without skipping tied timestamps', async () => {
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      insertMessage(sqlite, { createdAt: 100, id, text: id });
    }
    const middle = await agentSessionMessageService.listByCursor('session-1', {
      aroundMessageId: 'd',
      limit: 3,
    });
    expect(middle.items.map((message) => message.id)).toEqual(['e', 'd', 'c']);

    const older = await agentSessionMessageService.listByCursor('session-1', {
      cursor: middle.nextCursor,
      direction: 'older',
      limit: 3,
    });
    const newer = await agentSessionMessageService.listByCursor('session-1', {
      cursor: middle.previousCursor,
      direction: 'newer',
      limit: 3,
    });
    expect(older.items.map((message) => message.id)).toEqual(['b', 'a']);
    expect(older.nextCursor).toBeUndefined();
    expect(newer.items.map((message) => message.id)).toEqual(['g', 'f']);
    expect(newer.previousCursor).toBeUndefined();
    expect([...newer.items, ...middle.items, ...older.items].map((message) => message.id)).toEqual([
      'g',
      'f',
      'e',
      'd',
      'c',
      'b',
      'a',
    ]);
  });

  test('keeps the target in a one-row window and exposes the correct end boundaries', async () => {
    insertMessage(sqlite, { createdAt: 100, id: 'oldest', text: 'Old' });
    insertMessage(sqlite, { createdAt: 200, id: 'newest', text: 'New' });
    const oldest = await agentSessionMessageService.listByCursor('session-1', {
      aroundMessageId: 'oldest',
      limit: 1,
    });
    expect(oldest.items.map((message) => message.id)).toEqual(['oldest']);
    expect(oldest.nextCursor).toBeUndefined();
    expect(oldest.previousCursor).toBeDefined();

    const newest = await agentSessionMessageService.listByCursor('session-1', {
      aroundMessageId: 'newest',
      limit: 1,
    });
    expect(newest.items.map((message) => message.id)).toEqual(['newest']);
    expect(newest.nextCursor).toBeDefined();
    expect(newest.previousCursor).toBeUndefined();
  });

  test('rejects missing targets and targets from another session', async () => {
    insertMessage(sqlite, { createdAt: 100, id: 'target', text: 'Target' });
    insertSession(sqlite, 'session-2');
    await expect(
      agentSessionMessageService.listByCursor('session-2', {
        aroundMessageId: 'target',
      }),
    ).rejects.toMatchObject({ details: { id: 'target', resource: 'AgentSessionMessage' } });
    sqlite.prepare('DELETE FROM agent_session_message WHERE id = ?').run('target');
    await expect(
      agentSessionMessageService.listByCursor('session-1', {
        aroundMessageId: 'target',
      }),
    ).rejects.toMatchObject({ details: { id: 'target', resource: 'AgentSessionMessage' } });
  });

  test('preserves an unknown inference snapshot version as unsupported JSON', async () => {
    insertMessage(sqlite, { createdAt: 100, id: 'message-future', text: 'Future' });
    const futureSnapshot = { version: 2, opaque: { retained: true } };
    sqlite
      .prepare('UPDATE agent_session_message SET message_snapshot = ? WHERE id = ?')
      .run(JSON.stringify(futureSnapshot), 'message-future');

    const page = await agentSessionMessageService.listByCursor('session-1');
    expect(page.items[0]?.inferenceSnapshot).toEqual({
      status: 'unsupported',
      raw: futureSnapshot,
    });
  });
});

function insertSession(database: DatabaseSync, id: string): void {
  database
    .prepare(
      `INSERT INTO agent_session (
        id, agent_id, name, is_name_manually_edited, execution_target,
        last_activity_at, created_at, updated_at
      ) VALUES (?, 'agent-1', '', 0, '{"kind":"local"}', 1, 1, 1)`,
    )
    .run(id);
}

function insertMessage(
  database: DatabaseSync,
  values: { createdAt: number; id: string; text: string },
): void {
  database
    .prepare(
      `INSERT INTO agent_session_message (
        id, session_id, turn_id, role, data, status, stats, created_at, updated_at
      ) VALUES (?, 'session-1', ?, 'assistant', ?, 'success', ?, ?, ?)`,
    )
    .run(
      values.id,
      `turn-${values.id}`,
      JSON.stringify({
        version: 1,
        parts: [{ id: `part-${values.id}`, type: 'text', text: values.text, state: 'done' }],
      }),
      JSON.stringify({
        runtimeTiming: {
          startedAt: values.createdAt,
          completedAt: values.createdAt,
          spans: [],
        },
      }),
      values.createdAt,
      values.createdAt,
    );
}
