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

  test('paginates root families by their latest activity and loads only direct children', async () => {
    for (const [id, lastActivityAt] of [
      ['main', 100],
      ['other', 200],
      ['fork', 300],
      ['nested', 400],
    ] as const)
      insertSession(sqlite, { id, lastActivityAt, agentId: 'agent-1' });
    insertSession(sqlite, { id: 'another-agent', lastActivityAt: 500, agentId: 'agent-2' });
    sqlite
      .prepare('UPDATE agent_session SET forked_from_session_id = ? WHERE id = ?')
      .run('main', 'fork');
    sqlite
      .prepare('UPDATE agent_session SET forked_from_session_id = ? WHERE id = ?')
      .run('fork', 'nested');

    const first = await agentSessionService.listByCursor({
      groupBy: 'root',
      agentId: 'agent-1',
      limit: 1,
    });
    expect(first.items.map(({ id, hasChildren }) => ({ id, hasChildren }))).toEqual([
      { id: 'main', hasChildren: true },
    ]);
    const next = await agentSessionService.listByCursor({
      groupBy: 'root',
      agentId: 'agent-1',
      limit: 1,
      cursor: first.nextCursor,
    });
    expect(next.items.map(({ id }) => id)).toEqual(['other']);
    expect(next.nextCursor).toBeUndefined();

    const children = await agentSessionService.listByCursor({ parentSessionId: 'main', limit: 1 });
    expect(
      children.items.map(({ id, hasChildren, forkedFromSessionId }) => ({
        id,
        hasChildren,
        forkedFromSessionId,
      })),
    ).toEqual([{ id: 'fork', hasChildren: true, forkedFromSessionId: 'main' }]);
    expect(children.nextCursor).toBeUndefined();
    const grandchildren = await agentSessionService.listByCursor({ parentSessionId: 'fork' });
    expect(grandchildren.items.map(({ id, hasChildren }) => ({ id, hasChildren }))).toEqual([
      { id: 'nested', hasChildren: false },
    ]);
    expect((await agentSessionService.listByCursor()).items).toHaveLength(5);
  });

  test('keeps sibling pagination stable when replies change activity ordering', async () => {
    insertSession(sqlite, { agentId: 'agent-1', id: 'root', lastActivityAt: 1 });
    for (const id of ['child-a', 'child-b', 'child-c']) {
      insertSession(sqlite, { agentId: 'agent-1', id, lastActivityAt: 2 });
      sqlite
        .prepare('UPDATE agent_session SET forked_from_session_id = ? WHERE id = ?')
        .run('root', id);
    }
    const first = await agentSessionService.listByCursor({ parentSessionId: 'root', limit: 1 });
    expect(first.items.map(({ id }) => id)).toEqual(['child-a']);
    sqlite.prepare('UPDATE agent_session SET last_activity_at = 999 WHERE id = ?').run('child-a');
    const second = await agentSessionService.listByCursor({
      parentSessionId: 'root',
      limit: 1,
      cursor: first.nextCursor,
    });
    expect(second.items.map(({ id }) => id)).toEqual(['child-b']);
    const third = await agentSessionService.listByCursor({
      parentSessionId: 'root',
      limit: 1,
      cursor: second.nextCursor,
    });
    expect(third.items.map(({ id }) => id)).toEqual(['child-c']);
    expect(third.nextCursor).toBeUndefined();
  });

  test('reads the complete selected path in root-first order and handles a deleted origin', async () => {
    for (const [id, parent] of [
      ['root', null],
      ['child', 'root'],
      ['leaf', 'child'],
    ] as const) {
      insertSession(sqlite, { agentId: 'agent-1', id, lastActivityAt: 1 });
      if (parent)
        sqlite
          .prepare('UPDATE agent_session SET forked_from_session_id = ? WHERE id = ?')
          .run(parent, id);
    }
    expect(
      (await agentSessionService.getPath('leaf')).map(
        ({ id, hasChildren, forkedFromSessionId }) => ({ id, hasChildren, forkedFromSessionId }),
      ),
    ).toEqual([
      { id: 'root', hasChildren: true, forkedFromSessionId: null },
      { id: 'child', hasChildren: true, forkedFromSessionId: 'root' },
      { id: 'leaf', hasChildren: false, forkedFromSessionId: 'child' },
    ]);
    sqlite.prepare('DELETE FROM agent_session WHERE id = ?').run('root');
    expect((await agentSessionService.getPath('leaf')).map(({ id }) => id)).toEqual([
      'child',
      'leaf',
    ]);
    expect(
      (await agentSessionService.listByCursor({ groupBy: 'root' })).items.map(({ id }) => id),
    ).toEqual(['child']);
    await expect(agentSessionService.getPath('missing')).rejects.toMatchObject({
      details: { id: 'missing', resource: 'AgentSession' },
    });
  });

  test('searches titles across agents with literal wildcards and cursor pagination', async () => {
    insertSession(sqlite, { agentId: 'agent-1', id: '计划 100%_a', lastActivityAt: 100 });
    insertSession(sqlite, { agentId: 'agent-2', id: '计划 100%_b', lastActivityAt: 200 });
    insertSession(sqlite, { agentId: 'agent-2', id: '计划 100xx', lastActivityAt: 300 });
    const first = await agentSessionService.listByCursor({ q: '  100%_  ', limit: 1 });
    expect(first.items.map((session) => session.id)).toEqual(['计划 100%_b']);
    const second = await agentSessionService.listByCursor({
      q: '100%_',
      limit: 1,
      cursor: first.nextCursor,
    });
    expect(second.items.map((session) => session.id)).toEqual(['计划 100%_a']);
    expect(second.nextCursor).toBeUndefined();
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
        id, agent_id, name, is_name_manually_edited,
        last_activity_at, created_at, updated_at
      ) VALUES (?, ?, ?, 0, ?, ?, ?)`,
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
