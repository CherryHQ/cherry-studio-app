import { DatabaseSync } from 'node:sqlite';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';

import { agentSessionService } from '../AgentSessionService';
import { createTestDb, type TestDb } from './_testDb';

describe('AgentSessionService persistence', () => {
  let sqlite: DatabaseSync;
  let testDb: TestDb;

  beforeEach(async () => {
    sqlite = new DatabaseSync(':memory:');
    testDb = createTestDb(sqlite);
    await installTestHost({ DbService: testDb.dbService });
    insertAgent(sqlite, 'agent-1');
    insertAgent(sqlite, 'agent-2');
  });

  afterEach(async () => {
    await uninstallTestHost();
    sqlite.close();
  });

  test('lists by recency with stable cursor pagination and an optional agent filter', async () => {
    insertSession(sqlite, { agentId: 'agent-1', id: 'session-a', lastActivityAt: 100 });
    insertSession(sqlite, { agentId: 'agent-1', id: 'session-b', lastActivityAt: 300 });
    insertSession(sqlite, { agentId: 'agent-2', id: 'session-c', lastActivityAt: 300 });

    const first = await agentSessionService.listByCursor({ limit: 2 });
    expect(first.items.map((session) => session.id)).toEqual(['session-c', 'session-b']);
    expect(first.nextCursor).toBeDefined();

    const second = await agentSessionService.listByCursor({ cursor: first.nextCursor, limit: 2 });
    expect(second.items.map((session) => session.id)).toEqual(['session-a']);
    expect(second.nextCursor).toBeUndefined();

    await expect(agentSessionService.listByCursor({ agentId: 'agent-1' })).resolves.toMatchObject({
      items: [{ id: 'session-b' }, { id: 'session-a' }],
    });
  });

  test('keeps historical sessions readable after their Agent is soft-deleted', async () => {
    insertSession(sqlite, { agentId: 'agent-1', id: 'session-a', lastActivityAt: 100 });
    sqlite.prepare('UPDATE agent SET deleted_at = 200 WHERE id = ?').run('agent-1');

    await expect(agentSessionService.getById('session-a')).resolves.toMatchObject({
      agentId: 'agent-1',
      id: 'session-a',
      lastActivityAt: '1970-01-01T00:00:00.100Z',
    });
    await expect(agentSessionService.listByCursor({ agentId: 'agent-1' })).resolves.toMatchObject({
      items: [{ id: 'session-a' }],
    });
  });

  test('rejects an unknown session', async () => {
    await expect(agentSessionService.getById('missing')).rejects.toMatchObject({
      details: { id: 'missing', resource: 'AgentSession' },
    });
  });
});

function insertAgent(database: DatabaseSync, id: string): void {
  database
    .prepare(
      `INSERT INTO agent (id, name, order_key, created_at, updated_at)
       VALUES (?, ?, ?, 1, 1)`,
    )
    .run(id, id, id);
}

function insertSession(
  database: DatabaseSync,
  values: { agentId: string; id: string; lastActivityAt: number },
): void {
  database
    .prepare(
      `INSERT INTO agent_session (
        id, agent_id, title, title_is_manual, execution_target,
        last_activity_at, created_at, updated_at
      ) VALUES (?, ?, ?, 0, '{"kind":"local"}', ?, ?, ?)`,
    )
    .run(
      values.id,
      values.agentId,
      values.id,
      values.lastActivityAt,
      values.lastActivityAt,
      values.lastActivityAt,
    );
}
