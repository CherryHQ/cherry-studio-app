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
  expect(await files.findTrashedById(fileId, now)).toMatchObject({ id: fileId });
  expect(await files.findTrashedById(fileId, now - 1)).toBeNull();
  expect((await runtime.entries.list()).items).toEqual([
    { id: fileId, title: 'notes.txt', deletedAt: now, size: 123 },
  ]);
  await runtime.restore(fileId);
  expect(await files.findTrashedById(fileId, now)).toBeNull();
  expect((await resolveFileEntry(files, fileId))?.uri).toBe(bytes);
  expect(mockFiles.has(preview)).toBe(true);
  expect(await runtime.entries.summary()).toEqual({ files: 0, fileBytes: 0 });
});

test('session deletion removes messages immediately without trashing independent files', async () => {
  await sessions.deleteSession(sourceId);
  expect(await sessions.getSession(sourceId)).toBeNull();
  expect(sqlite.prepare('SELECT count(*) AS count FROM agent_session_message').get()).toEqual({
    count: 0,
  });
  expect(await sessions.getSession(forkId)).toMatchObject({
    forkedFromSessionId: null,
    forkBoundaryMessageId: null,
  });
  expect((await runtime.entries.list()).items).toEqual([]);
  expect(await files.findById(fileId)).not.toBeNull();
  expect(mockFiles.has(bytes)).toBe(true);
});

test('pagination includes each file when deletion timestamps match', async () => {
  sqlite.exec(`
    INSERT INTO file_entry (id, filename, media_type, size, created_at, updated_at)
    VALUES ('${sourceId}', 'other.txt', 'text/plain', 5, 1, 1);
  `);
  await trashInternalEntry(files, fileId);
  await trashInternalEntry(files, sourceId);
  const first = await runtime.entries.list({ limit: 1 });
  const second = await runtime.entries.list({ limit: 1, cursor: first.nextCursor });
  expect([first.items[0].id, second.items[0].id].sort()).toEqual([fileId, sourceId].sort());
  expect(second.nextCursor).toBeUndefined();
  expect(await runtime.entries.summary()).toEqual({ files: 2, fileBytes: 128 });
});

test('automatic removal uses a strict 30-day boundary and deletes file bytes and previews', async () => {
  const cutoff = now - TRASH_RETENTION_MS;
  sqlite.prepare('UPDATE file_entry SET deleted_at = ? WHERE id = ?').run(cutoff, fileId);
  await runtime.sweep();
  expect((await runtime.entries.list()).items.map((item) => item.id)).toEqual([fileId]);
  expect(mockFiles.has(bytes)).toBe(true);
  expect(mockFiles.has(preview)).toBe(true);
  sqlite.prepare('UPDATE file_entry SET deleted_at = ? WHERE id = ?').run(cutoff - 1, fileId);
  await runtime.sweep();
  expect(mockFiles.has(bytes)).toBe(false);
  expect(mockFiles.has(preview)).toBe(false);
  expect((await runtime.entries.list()).items).toEqual([]);
  expect(await sessions.getSession(forkId)).not.toBeNull();
});

test('stale deletion snapshots cannot remove restored records', async () => {
  await trashInternalEntry(files, fileId);
  const candidates = await runtime.entries.candidates();
  await runtime.restore(fileId);
  for (const item of candidates) {
    expect(await deleteInternalEntry(files, item.id, item.deletedAt)).toBe(false);
  }
  expect(mockFiles.has(bytes)).toBe(true);
});

test('a failed restore leaves membership intact and emptying trash leaves sessions intact', async () => {
  await trashInternalEntry(files, fileId);
  db.failNextWriteTx(new Error('disk full'));
  await expect(runtime.restore(fileId)).rejects.toThrow('disk full');
  expect(await files.findById(fileId)).toBeNull();
  expect(await runtime.entries.summary()).toEqual({ files: 1, fileBytes: 123 });
  await runtime.empty();
  expect(await runtime.entries.summary()).toEqual({ files: 0, fileBytes: 0 });
  expect(await sessions.listMessages(sourceId)).toHaveLength(1);
  expect(await sessions.getSession(forkId)).not.toBeNull();
});

test('backup freeze prevents trash mutations and cleanup', async () => {
  await trashInternalEntry(files, fileId);
  const release = storageMutationGate.freeze();
  try {
    expect(() => runtime.empty()).toThrow();
    expect(() => runtime.sweep()).toThrow();
    expect(() => runtime.restore(fileId)).toThrow();
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
  await runtime.restore(fileId);
  expect(mockContents.get(bytes)).toBe('x'.repeat(123));
  expect(await files.getById(fileId)).toMatchObject({ size: 123, updatedAt: 1 });
});

test('an admitted draft edit commits matching metadata before the queued deletion', async () => {
  sqlite.prepare("UPDATE file_entry SET provenance = 'generated' WHERE id = ?").run(fileId);
  const editing = rewriteInternalTextEntry(files, { id: fileId, data: 'changed' });
  const deleting = trashInternalEntry(files, fileId);
  await Promise.all([editing, deleting]);
  await runtime.restore(fileId);
  expect(mockContents.get(bytes)).toBe('changed');
  expect(await files.getById(fileId)).toMatchObject({ size: 7, updatedAt: now });
});

test('a failed unlink still removes the entry permanently', async () => {
  await trashInternalEntry(files, fileId);
  mockUnlinkFailures.add(bytes);
  await runtime.delete(fileId);
  expect((await runtime.entries.list()).items).toEqual([]);
  expect(await runtime.entries.summary()).toEqual({ files: 0, fileBytes: 0 });
  await expect(runtime.restore(fileId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

test('a failed deletion commit preserves the recoverable entry and its bytes', async () => {
  await trashInternalEntry(files, fileId);
  db.failWriteTxCommit(new Error('commit failed'));
  await expect(runtime.delete(fileId)).rejects.toThrow('commit failed');
  expect(await runtime.entries.get(fileId)).toMatchObject({ id: fileId });
  expect(mockFiles.has(bytes)).toBe(true);
  expect(mockFiles.has(preview)).toBe(true);
  await runtime.restore(fileId);
  expect(await files.findById(fileId)).not.toBeNull();
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
