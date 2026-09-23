import { DatabaseSync } from 'node:sqlite';

import type { AgentProjection } from '@cherrystudio/remote-protocol/agent';

import { DesktopConnectionService } from '../DesktopConnectionService';
import { RemoteSessionProjectionStore } from '../RemoteSessionProjectionStore';
import { createTestDb, type TestDb } from './_testDb';

const signal = () => new AbortController().signal;
const projection = (seq: string): AgentProjection => ({
  cursor: { sessionId: 's', streamEpoch: 'epoch', seq },
  session: {
    sessionId: 's',
    agentId: 'a',
    workspaceId: 'w',
    title: `Revision ${seq}`,
    updatedAt: '2026-09-22T00:00:00.000Z',
    historyRevision: seq,
    idleRevision: seq,
  },
  messages: {},
  parts: {},
  executions: {},
  interactions: {},
  tombstones: [],
});
let db: TestDb;
let store: RemoteSessionProjectionStore;
beforeEach(async () => {
  db = createTestDb(new DatabaseSync(':memory:'));
  await new DesktopConnectionService(db.dbService).savePair(
    {
      id: 'pc',
      name: 'Desktop',
      deviceId: 'device',
      desktopIdentity: 'identity',

      grants: [{ domain: 'agent', grantId: 'grant' }],
    },
    false,
    signal(),
  );
  store = new RemoteSessionProjectionStore(db.dbService);
});
afterEach(() => db.sqlite.close());

it('isolates identity/grant scopes and rolls projection and cursor back together on commit failure', async () => {
  await store.write('pc', 'old-pairing-scope', projection('1'), signal());
  await store.write('pc', 'new-pairing-scope', projection('2'), signal());
  db.failWriteTxCommit(new Error('disk full'));
  await expect(store.write('pc', 'new-pairing-scope', projection('3'), signal())).rejects.toThrow(
    'disk full',
  );
  expect((await store.read('pc', 'old-pairing-scope', 's'))?.cursor.seq).toBe('1');
  const current = await store.read('pc', 'new-pairing-scope', 's');
  expect(current).toMatchObject({ cursor: { seq: '2' }, session: { title: 'Revision 2' } });
});

it('rejects writes after the scope has retired and ignores a cursor/projection mismatch on restore', async () => {
  await store.write('pc', 'scope', projection('1'), signal());
  const cancelled = new AbortController();
  cancelled.abort();
  await expect(store.write('pc', 'scope', projection('2'), cancelled.signal)).rejects.toMatchObject(
    { name: 'AbortError' },
  );
  expect((await store.read('pc', 'scope', 's'))?.cursor.seq).toBe('1');
  db.sqlite.prepare("UPDATE remote_session_projection SET seq = '999'").run();
  expect(await store.read('pc', 'scope', 's')).toBeUndefined();
});
