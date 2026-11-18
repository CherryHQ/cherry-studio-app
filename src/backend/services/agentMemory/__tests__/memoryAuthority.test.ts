import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import type { DbService } from '@/backend/data/db/DbService';
import { createTestDb } from '@/backend/data/services/__tests__/_testDb';
import { MemoryContextChangedError } from '@/shared/contracts/memory';

import { createMemoryAuthority } from '../memoryAuthority';
import { MemoryHistory } from '../memoryHistory';

const AGENT = '10000000-0000-4000-8000-000000000001';
const OTHER = '10000000-0000-4000-8000-000000000002';
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  const db = createTestDb(sqlite);
  const service = {
    ...db.dbService,
    getSqlite: () => ({
      getFirstSync: (sql: string, ...args: SQLInputValue[]) =>
        sqlite.prepare(sql).get(...args) ?? null,
      getAllSync: (sql: string, ...args: SQLInputValue[]) => sqlite.prepare(sql).all(...args),
    }),
  } as unknown as DbService;
  for (const [id, order] of [
    [AGENT, 'a0'],
    [OTHER, 'a1'],
  ])
    sqlite
      .prepare('INSERT INTO agent (id,name,order_key,created_at,updated_at) VALUES (?,?,?,1,1)')
      .run(id, 'Writer', order);
  for (const [id, agent] of [
    ['chat', AGENT],
    ['new', AGENT],
    ['foreign', OTHER],
  ])
    sqlite
      .prepare(
        'INSERT INTO agent_session (id,agent_id,last_activity_at,created_at,updated_at) VALUES (?,?,1,1,1)',
      )
      .run(id, agent);
  function message(
    id: string,
    parent: string | null,
    role: 'user' | 'assistant',
    text: string,
    time: number,
    session = 'chat',
  ) {
    sqlite
      .prepare(
        "INSERT INTO agent_session_message (id,session_id,parent_id,role,status,data,searchable_text,created_at,updated_at) VALUES (?,?,?,?,'success',?,?,?,?)",
      )
      .run(
        id,
        session,
        parent,
        role,
        JSON.stringify({ parts: [{ type: 'text', text }] }),
        text,
        time,
        time,
      );
  }
  return { sqlite, db: service, message };
}

test('live shared opt-out revokes old receipts permanently without blocking this Agent’s private scope', () => {
  const f = fixture();
  try {
    const caller = { agentId: AGENT, sessionId: 'chat' };
    const shared = createMemoryAuthority(f.db, caller, { kind: 'shared' });
    f.sqlite.exec(
      `UPDATE agent SET shared_memory_enabled = 0,updated_at = 2 WHERE id = '${AGENT}'`,
    );
    expect(() => shared.assertAuthorized()).toThrow();
    expect(() =>
      createMemoryAuthority(f.db, caller, { kind: 'private', agentId: AGENT }).assertAuthorized(),
    ).not.toThrow();
    f.sqlite.exec(
      `UPDATE agent SET shared_memory_enabled = 1,updated_at = 3 WHERE id = '${AGENT}'`,
    );
    expect(() => shared.assertAuthorized()).toThrow();
    expect(() =>
      createMemoryAuthority(f.db, { ...caller, sessionId: 'foreign' }, { kind: 'shared' }),
    ).toThrow();
    expect(() =>
      createMemoryAuthority(f.db, caller, { kind: 'private', agentId: OTHER }),
    ).toThrow();
  } finally {
    f.sqlite.close();
  }
});

test('persisted protection blocks old history across authority replacement and shared withdrawal', async () => {
  const f = fixture();
  try {
    const scope = { kind: 'shared' } as const;
    const caller = { agentId: AGENT, sessionId: 'chat', hasHistory: false };
    await createMemoryAuthority(f.db, caller, scope).assertHistory!(null);
    await expect(
      createMemoryAuthority(f.db, caller, scope).assertHistory!('forgotten-state'),
    ).rejects.toBeInstanceOf(MemoryContextChangedError);
    f.sqlite.exec(
      `UPDATE agent SET shared_memory_enabled = 0,updated_at = 2 WHERE id = '${AGENT}'`,
    );
    await expect(
      createMemoryAuthority(f.db, caller, scope, undefined, true).assertHistory!('forgotten-state'),
    ).rejects.toBeInstanceOf(MemoryContextChangedError);
    await expect(
      createMemoryAuthority(
        f.db,
        { ...caller, sessionId: 'new', hasHistory: true },
        scope,
        undefined,
        true,
      ).assertHistory!('forgotten-state'),
    ).rejects.toBeInstanceOf(MemoryContextChangedError);
    await createMemoryAuthority(f.db, { ...caller, sessionId: 'new' }, scope, undefined, true)
      .assertHistory!('forgotten-state');
    expect(f.sqlite.prepare('SELECT COUNT(*) AS count FROM app_state').get()).toEqual({ count: 2 });
  } finally {
    f.sqlite.close();
  }
});

test('source admission and historical recall use successful selected product branches and recheck edits', async () => {
  const f = fixture();
  try {
    f.message('q', null, 'user', '中文偏好', 100);
    f.message('r', 'q', 'assistant', 'Reply context', 101);
    f.message('other', 'q', 'assistant', 'Unselected sibling', 102);
    f.sqlite.exec("UPDATE agent_session SET active_node_id = 'r' WHERE id = 'chat'");
    const history = new MemoryHistory(f.db);
    expect(history.completedRange(AGENT, 'r', 99)?.messages.map((message) => message.id)).toEqual([
      'q',
      'r',
    ]);
    expect(history.completedRange(AGENT, 'r', 101)).toBeUndefined();
    expect(history.completedRange(AGENT, 'other', 99)).toBeUndefined();
    const caller = { agentId: AGENT, sessionId: 'new' };
    const signal = new AbortController().signal;
    expect(
      (await history.search(caller, { query: '中' }, async () => true, signal)).hits.map(
        (hit) => hit.messageId,
      ),
    ).toEqual(['q']);
    expect(
      (
        await history.search(
          { ...caller, userMessageId: 'q' },
          { query: '中' },
          async () => true,
          signal,
        )
      ).hits,
    ).toEqual([]);
    expect(
      (
        await history.search(
          caller,
          { messageId: 'other', conversationId: 'chat' },
          async () => true,
          signal,
        )
      ).hits,
    ).toEqual([]);
    expect(
      (
        await history.search(
          { agentId: OTHER, sessionId: 'foreign' },
          { query: '中' },
          async () => true,
          signal,
        )
      ).hits,
    ).toEqual([]);
    expect((await history.search(caller, { query: '中' }, async () => false, signal)).hits).toEqual(
      [],
    );
    let first = true;
    await expect(
      history.search(
        caller,
        { query: '中' },
        async () => {
          if (first) {
            first = false;
            f.sqlite.exec("UPDATE agent_session_message SET updated_at = 999 WHERE id = 'q'");
          }
          return true;
        },
        signal,
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
  } finally {
    f.sqlite.close();
  }
});
