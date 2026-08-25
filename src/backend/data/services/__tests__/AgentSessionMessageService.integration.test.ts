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
        `INSERT INTO agent (id, name, settings, order_key, created_at, updated_at)
         VALUES ('agent-1', 'Agent', '{}', 'a0', 1, 1)`,
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
      parts: [{ state: 'done', text: 'C', type: 'text' }],
      sessionId: 'session-1',
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
});

function insertSession(database: DatabaseSync, id: string): void {
  database
    .prepare(
      `INSERT INTO agent_session (
        id, agent_id, title, title_is_manual, execution_target,
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
        id, session_id, turn_id, role, data, status, created_at, updated_at
      ) VALUES (?, 'session-1', ?, 'assistant', ?, 'success', ?, ?)`,
    )
    .run(
      values.id,
      `turn-${values.id}`,
      JSON.stringify({
        version: 1,
        parts: [{ id: `part-${values.id}`, type: 'text', text: values.text, state: 'done' }],
      }),
      values.createdAt,
      values.createdAt,
    );
}
