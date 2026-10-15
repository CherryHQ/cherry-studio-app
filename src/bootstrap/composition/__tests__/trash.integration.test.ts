import { DatabaseSync } from 'node:sqlite';

import { AppState, type AppStateStatus } from 'react-native';

import { SqliteAgentSessionStore } from '@/backend/ai/agent/sessionStore/SqliteAgentSessionStore';
import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import { createTestDb } from '@/backend/data/services/__tests__/_testDb';
import { FileEntryService } from '@/backend/data/services/FileEntryService';
import {
  deleteInternalEntry,
  resolveFileEntry,
  rewriteInternalTextEntry,
  trashInternalEntry,
} from '@/backend/services/file/fileStorage';
import { TrashRuntime } from '@/backend/services/trash';
import { TRASH_RETENTION_MS } from '@/shared/data/api/schemas/trash';

const mockFiles = new Set<string>();
const mockContents = new Map<string, string>();
const mockUnlinkFailures = new Set<string>();
jest.mock('@/backend/data/storage/storagePaths', () => ({
  storageDirectory: () => 'file:///storage',
}));
jest.mock('expo-file-system', () => {
  class Entry {
    readonly uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    delete() {
      if (mockUnlinkFailures.has(this.uri)) throw new Error('unlink failed');
      mockFiles.delete(this.uri);
      mockContents.delete(this.uri);
    }
    write(content: string) {
      mockFiles.add(this.uri);
      mockContents.set(this.uri, content);
    }
    get size() {
      return new TextEncoder().encode(mockContents.get(this.uri) ?? '').byteLength;
    }
  }
  return { File: Entry, Directory: Entry, Paths: { cache: 'file:///cache' } };
});

const fileId = '00000000-0000-7000-8000-000000000001';
const sourceId = '00000000-0000-7000-8000-000000000002';
const forkId = '00000000-0000-7000-8000-000000000003';
const bytes = `file:///storage/Data/Files/${fileId}.txt`;
const preview = `file:///cache/FilePreviewImages/v1_${fileId}_1.webp`;
const now = 40 * 86_400_000;

let sqlite: DatabaseSync;
let db: ReturnType<typeof createTestDb>;
let runtime: TrashRuntime;
let files: FileEntryService;
let sessions: SqliteAgentSessionStore;

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(now);
  mockFiles.clear();
  mockContents.clear();
  mockUnlinkFailures.clear();
  sqlite = new DatabaseSync(':memory:');
  db = createTestDb(sqlite);
  runtime = new TrashRuntime(db.dbService);
  files = new FileEntryService(db.dbService);
  sessions = new SqliteAgentSessionStore(db.dbService);
  sqlite.exec(`
    INSERT INTO agent (id, name, order_key, created_at, updated_at) VALUES ('agent', 'Chat', 'a0', 1, 1);
    INSERT INTO agent_session (id, agent_id, name, last_activity_at, created_at, updated_at)
    VALUES ('${sourceId}', 'agent', 'Source', 1, 1, 1);
    INSERT INTO agent_session_message (id, session_id, role, data, status, created_at, updated_at)
    VALUES ('message', '${sourceId}', 'user', '{"parts":[]}', 'success', 1, 1);
    INSERT INTO agent_session (id, agent_id, name, last_activity_at, created_at, updated_at, forked_from_session_id, fork_boundary_message_id)
    VALUES ('${forkId}', 'agent', 'Fork', 1, 1, 1, '${sourceId}', 'boundary');
    INSERT INTO file_entry (id, filename, media_type, size, provenance, created_at, updated_at)
    VALUES ('${fileId}', 'notes.txt', 'text/plain', 123, 'imported', 1, 1);
  `);
  mockFiles.add(bytes);
  mockContents.set(bytes, 'x'.repeat(123));
  mockFiles.add(preview);
});

afterEach(async () => {
  await runtime._doStop();
  sqlite.close();
  jest.restoreAllMocks();
});

test('file trash preserves bytes and previews, hides ordinary reads, and restores the same identity', async () => {
  await expect(trashInternalEntry(files, fileId)).resolves.toBe(true);
  expect(mockFiles.has(bytes)).toBe(true);
  expect(mockFiles.has(preview)).toBe(true);
  expect((await files.listByCursor()).items).toEqual([]);
  await expect(resolveFileEntry(files, fileId)).resolves.toBeNull();
  expect((await runtime.entries.list({ kind: 'file' })).items).toEqual([
    { id: fileId, kind: 'file', title: 'notes.txt', deletedAt: now, size: 123, state: 'trashed' },
  ]);
  await runtime.restore('file', fileId);
  expect((await resolveFileEntry(files, fileId))?.uri).toBe(bytes);
  expect(mockFiles.has(preview)).toBe(true);
  expect(await runtime.entries.summary()).toEqual({ files: 0, sessions: 0, fileBytes: 0 });
});

test('session trash preserves transcript, activity, and fork lineage for restoration', async () => {
  await sessions.deleteSession(sourceId);
  expect(await sessions.getSession(sourceId)).toBeNull();
  expect(await sessions.getRuntimeRevision(sourceId)).toBeNull();
  expect(await sessions.listMessages(sourceId)).toEqual([]);
  expect(sqlite.prepare('SELECT count(*) AS count FROM agent_session_message').get()).toEqual({
    count: 1,
  });
  expect((await sessions.getSession(forkId))?.forkedFromSessionId).toBe(sourceId);
  await runtime.restore('session', sourceId);
  expect(await sessions.listMessages(sourceId)).toHaveLength(1);
  expect(
    sqlite
      .prepare(
        'SELECT last_activity_at, deleted_at, runtime_revision FROM agent_session WHERE id = ?',
      )
      .get(sourceId),
  ).toEqual({ last_activity_at: 1, deleted_at: null, runtime_revision: 1 });
});

test('permanent session deletion cascades messages and clears surviving lineage without deleting files', async () => {
  await expect(runtime.delete('session', sourceId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await sessions.deleteSession(sourceId);
  await runtime.delete('session', sourceId);
  expect(sqlite.prepare('SELECT count(*) AS count FROM agent_session_message').get()).toEqual({
    count: 0,
  });
  expect(await sessions.getSession(forkId)).toMatchObject({
    forkedFromSessionId: null,
    forkBoundaryMessageId: null,
  });
  expect(await files.findById(fileId)).not.toBeNull();
  expect(mockFiles.has(bytes)).toBe(true);
});

test('mixed pagination is stable across kind/id collisions and category filters', async () => {
  // A session and file may have the same id: pagination must include the kind in its tie-break.
  sqlite.prepare('UPDATE agent_session SET id = ? WHERE id = ?').run(fileId, forkId);
  await sessions.deleteSession(fileId);
  await trashInternalEntry(files, fileId);
  const first = await runtime.entries.list({ limit: 1 });
  const second = await runtime.entries.list({ limit: 1, cursor: first.nextCursor });
  expect([first.items[0].kind, second.items[0].kind].sort()).toEqual(['file', 'session']);
  expect(second.nextCursor).toBeUndefined();
  expect((await runtime.entries.list({ kind: 'file' })).items.map((item) => item.kind)).toEqual([
    'file',
  ]);
  expect(await runtime.entries.summary()).toEqual({ files: 1, sessions: 1, fileBytes: 123 });
});

test('automatic removal uses a strict 30-day boundary and deletes file bytes and previews', async () => {
  const cutoff = now - TRASH_RETENTION_MS;
  sqlite.prepare('UPDATE agent_session SET deleted_at = ? WHERE id = ?').run(cutoff, sourceId);
  sqlite.prepare('UPDATE file_entry SET deleted_at = ? WHERE id = ?').run(cutoff - 1, fileId);
  await runtime.sweep();
  expect(mockFiles.has(bytes)).toBe(false);
  expect(mockFiles.has(preview)).toBe(false);
  expect((await runtime.entries.list()).items.map((item) => item.id)).toEqual([sourceId]);
  expect(await sessions.getSession(forkId)).not.toBeNull();
});

test('stale deletion snapshots cannot remove restored records', async () => {
  await sessions.deleteSession(sourceId);
  await trashInternalEntry(files, fileId);
  const candidates = await runtime.entries.candidates('all');
  await runtime.restore('session', sourceId);
  await runtime.restore('file', fileId);
  for (const item of candidates) {
    const removed =
      item.kind === 'file'
        ? await deleteInternalEntry(files, item.id, item.deletedAt)
        : await runtime.entries.deleteSession(item);
    expect(removed).toBe(false);
  }
  expect(await sessions.listMessages(sourceId)).toHaveLength(1);
  expect(mockFiles.has(bytes)).toBe(true);
});

test('emptying a category keeps the other category and a failed restore leaves membership intact', async () => {
  await sessions.deleteSession(sourceId);
  await trashInternalEntry(files, fileId);
  db.failNextWriteTx(new Error('disk full'));
  await expect(runtime.restore('file', fileId)).rejects.toThrow('disk full');
  expect(await files.findById(fileId)).toBeNull();
  await runtime.empty('session');
  expect(await runtime.entries.summary()).toEqual({ files: 1, sessions: 0, fileBytes: 123 });
  await runtime.empty('all');
  expect(await runtime.entries.summary()).toEqual({ files: 0, sessions: 0, fileBytes: 0 });
  expect(await sessions.getSession(forkId)).not.toBeNull();
});

test('backup freeze prevents trash mutations and cleanup', async () => {
  await trashInternalEntry(files, fileId);
  const release = storageMutationGate.freeze();
  try {
    expect(() => runtime.empty('all')).toThrow();
    expect(() => runtime.sweep()).toThrow();
    expect(() => runtime.restore('file', fileId)).toThrow();
    expect(mockFiles.has(bytes)).toBe(true);
  } finally {
    release();
  }
});

test('a queued deletion prevents a later draft edit from changing the recoverable bytes', async () => {
  sqlite.prepare("UPDATE file_entry SET provenance = 'generated' WHERE id = ?").run(fileId);
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const blocking = db.dbService.withWriteTx(async () => barrier);
  const deleting = trashInternalEntry(files, fileId);
  const editing = expect(
    rewriteInternalTextEntry(files, { id: fileId, data: 'changed' }),
  ).rejects.toThrow('Draft file entry does not exist');
  release();
  await Promise.all([blocking, deleting, editing]);
  await runtime.restore('file', fileId);
  expect(mockContents.get(bytes)).toBe('x'.repeat(123));
  expect(await files.getById(fileId)).toMatchObject({ size: 123, updatedAt: 1 });
});

test('an admitted draft edit commits matching metadata before the queued deletion', async () => {
  sqlite.prepare("UPDATE file_entry SET provenance = 'generated' WHERE id = ?").run(fileId);
  const editing = rewriteInternalTextEntry(files, { id: fileId, data: 'changed' });
  const deleting = trashInternalEntry(files, fileId);
  await Promise.all([editing, deleting]);
  await runtime.restore('file', fileId);
  expect(mockContents.get(bytes)).toBe('changed');
  expect(await files.getById(fileId)).toMatchObject({ size: 7, updatedAt: now });
});

test.each(['blob', 'preview'])(
  'retries a failed %s unlink after runtime replacement without allowing restoration',
  async (resource) => {
    await trashInternalEntry(files, fileId);
    mockUnlinkFailures.add(resource === 'blob' ? bytes : preview);
    await expect(runtime.delete('file', fileId)).rejects.toThrow('unlink failed');
    expect(await files.findById(fileId)).toBeNull();
    expect(await runtime.entries.get('file', fileId)).toMatchObject({
      state: 'deleting',
      size: 123,
    });
    expect(await runtime.entries.summary()).toEqual({ files: 1, sessions: 0, fileBytes: 123 });
    await expect(runtime.restore('file', fileId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await runtime._doStop();
    runtime = new TrashRuntime(db.dbService);
    mockUnlinkFailures.clear();
    // A committed unlink is retried immediately, even though retention has not elapsed.
    await runtime.sweep();
    expect(mockFiles.has(bytes)).toBe(false);
    expect(mockFiles.has(preview)).toBe(false);
    expect(await runtime.entries.summary()).toEqual({ files: 0, sessions: 0, fileBytes: 0 });
  },
);

test('an interruption after recording permanent deletion leaves a receipt the next sweep completes', async () => {
  await trashInternalEntry(files, fileId);
  await files.withWriteTx((tx) => files.beginDeletionTx(tx, fileId, now));
  expect(mockFiles.has(bytes)).toBe(true);
  await runtime._doStop();
  runtime = new TrashRuntime(db.dbService);
  await runtime.sweep();
  expect(mockFiles.has(bytes)).toBe(false);
  expect(mockFiles.has(preview)).toBe(false);
  expect((await runtime.entries.list()).items).toEqual([]);
});

test('a failed deletion commit preserves the recoverable entry and its bytes', async () => {
  await trashInternalEntry(files, fileId);
  db.failWriteTxCommit(new Error('commit failed'));
  await expect(runtime.delete('file', fileId)).rejects.toThrow('commit failed');
  expect(await runtime.entries.get('file', fileId)).toMatchObject({ state: 'trashed' });
  expect(mockFiles.has(bytes)).toBe(true);
  expect(mockFiles.has(preview)).toBe(true);
  await runtime.restore('file', fileId);
  expect(await files.findById(fileId)).not.toBeNull();
});

test('retries acknowledgement after bytes were removed but the receipt could not be cleared', async () => {
  await trashInternalEntry(files, fileId);
  db.failWriteTxCommit(new Error('commit failed'), 1);
  await expect(runtime.delete('file', fileId)).rejects.toThrow('commit failed');
  expect(mockFiles.has(bytes)).toBe(false);
  expect(mockFiles.has(preview)).toBe(false);
  expect(await runtime.entries.get('file', fileId)).toMatchObject({ state: 'deleting' });
  await runtime.delete('file', fileId);
  expect((await runtime.entries.list()).items).toEqual([]);
});

test('emptying continues past unlink failures and retries only the remaining receipt', async () => {
  await trashInternalEntry(files, fileId);
  await sessions.deleteSession(sourceId);
  mockUnlinkFailures.add(bytes);
  await expect(runtime.empty('all')).rejects.toThrow('Some trash items could not be removed');
  expect((await runtime.entries.list()).items).toEqual([
    expect.objectContaining({ id: fileId, state: 'deleting' }),
  ]);
  mockUnlinkFailures.clear();
  await runtime.empty('file');
  expect((await runtime.entries.list()).items).toEqual([]);
});

test('sweeps at startup and on foreground entry, and releases its app-state subscription on stop', async () => {
  let change!: (state: AppStateStatus) => void;
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    change = listener;
    return { remove };
  });
  const sweep = jest.spyOn(runtime, 'sweep').mockResolvedValue(undefined);
  await runtime._doInit();
  expect(sweep).toHaveBeenCalledTimes(1);
  change('background');
  expect(sweep).toHaveBeenCalledTimes(1);
  change('active');
  expect(sweep).toHaveBeenCalledTimes(2);
  await runtime._doStop();
  expect(remove).toHaveBeenCalledTimes(1);
});
