import { DatabaseSync } from 'node:sqlite';

import type { PreferenceService } from '@/backend/data/PreferenceService';
import { createTestDb } from '@/backend/data/services/__tests__/_testDb';
import { downloadFile } from '@/backend/services/download';

import { DeepseekImportRuntime } from '../DeepseekImportRuntime';

const mockConversations = new Map<string, unknown>();
const mockDeleteStaging = jest.fn();
jest.mock('expo-file-system', () => {
  class Entry {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    get exists() {
      return true;
    }
    get size() {
      return 100;
    }
    create() {}
    delete() {
      mockDeleteStaging();
    }
  }
  return { File: Entry, Directory: Entry, Paths: { cache: 'file:///cache' } };
});
jest.mock('@/backend/services/download', () => ({
  downloadFile: jest.fn(async () => 'file:///cache/export.zip'),
  FileDownloadError: class extends Error {},
}));
jest.mock('@/backend/services/file/fileStorage', () => ({
  discardInternalEntries: jest.fn(async () => {}),
}));
jest.mock('@/backend/services/file/importManagedFile', () => ({ importManagedFile: jest.fn() }));
jest.mock('../deepseekArchive', () => ({
  deepseekArchiveFile: (_root: unknown, path: string) => ({ uri: path }),
  readDeepseekJson: async (file: { uri: string }) => mockConversations.get(file.uri),
  unpackDeepseekArchive: async () => ({
    index: ['first', 'second'].map((id) => ({ id, inserted_at: 1, updated_at: 2 })),
    names: new Set(),
  }),
}));

const url =
  'https://deepseek-chat-history-exports-prod.obs.cn-east-3.myhuaweicloud.com/00000000-0000-4000-8000-000000000001.zip?response-content-disposition=attachment%3B%20filename%3Ddeepseek_data-2026-11-17.zip&Expires=4102444800&AccessKeyId=EXAMPLE&Signature=example%3D';
let sqlite: DatabaseSync;
let db: ReturnType<typeof createTestDb>;
let importer: DeepseekImportRuntime;

beforeEach(() => {
  jest.clearAllMocks();
  sqlite = new DatabaseSync(':memory:');
  db = createTestDb(sqlite);
  importer = new DeepseekImportRuntime(db.dbService, {
    get: async () => null,
  } as unknown as PreferenceService);
  sqlite.exec(
    "INSERT INTO agent (id, name, order_key, created_at, updated_at) VALUES ('existing', 'Existing', 'a0', 1, 1)",
  );
  mockConversations.clear();
  for (const id of ['first', 'second'])
    mockConversations.set(`chat_sessions/${id}.json`, {
      id,
      title: id,
      current_message_id: 2,
      inserted_at: '2026-11-01T00:00:00Z',
      messages: [
        {
          id: 1,
          parent_id: null,
          role: 'USER',
          status: 'FINISHED',
          inserted_at: '2026-11-01T00:00:00Z',
          fragments: [{ type: 'REQUEST', content: `Question ${id}` }],
        },
        {
          id: 2,
          parent_id: 1,
          role: 'ASSISTANT',
          status: 'FINISHED',
          inserted_at: '2026-11-01T00:00:01Z',
          fragments: [{ type: 'RESPONSE', content: `Answer ${id}` }],
        },
      ],
    });
});
afterEach(async () => {
  await importer.dispose();
  sqlite.close();
});

test('creates one new DeepSeek agent and assigns every conversation while preserving existing agents', async () => {
  const result = await importer.importFromUrl(url, {
    signal: new AbortController().signal,
    onProgress: () => {},
  });
  expect(result).toMatchObject({ sessions: 2, messages: 4, missingAttachments: 0 });
  expect(sqlite.prepare('SELECT id, name FROM agent ORDER BY name').all()).toEqual([
    { id: result.agentId, name: 'DeepSeek' },
    { id: 'existing', name: 'Existing' },
  ]);
  expect(sqlite.prepare('SELECT DISTINCT agent_id FROM agent_session').all()).toEqual([
    { agent_id: result.agentId },
  ]);
  expect(sqlite.prepare('SELECT count(*) AS count FROM agent_session_message').get()).toEqual({
    count: 4,
  });
  expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  const second = await importer.importFromUrl(url, {
    signal: new AbortController().signal,
    onProgress: () => {},
  });
  expect(second.agentId).not.toBe(result.agentId);
  expect(sqlite.prepare('SELECT count(*) AS count FROM agent').get()).toEqual({ count: 3 });
});

test('a failed commit rolls back the new agent and all conversations', async () => {
  db.failWriteTxCommit(new Error('disk failure'));
  await expect(
    importer.importFromUrl(url, { signal: new AbortController().signal, onProgress: () => {} }),
  ).rejects.toMatchObject({ code: 'failed' });
  expect(sqlite.prepare('SELECT count(*) AS count FROM agent').get()).toEqual({ count: 1 });
  expect(sqlite.prepare('SELECT count(*) AS count FROM agent_session').get()).toEqual({ count: 0 });
  expect(sqlite.prepare('SELECT count(*) AS count FROM agent_session_message').get()).toEqual({
    count: 0,
  });
  expect(mockDeleteStaging).toHaveBeenCalled();
});

test('cancelling between conversations rolls back imported rows', async () => {
  const controller = new AbortController();
  await expect(
    importer.importFromUrl(url, {
      signal: controller.signal,
      onProgress: (progress) => {
        if (progress.phase === 'importing' && progress.completed === 1) controller.abort();
      },
    }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(sqlite.prepare('SELECT count(*) AS count FROM agent').get()).toEqual({ count: 1 });
  expect(sqlite.prepare('SELECT count(*) AS count FROM agent_session').get()).toEqual({ count: 0 });
  expect(importer.hasPendingStorageWork()).toBe(false);
});

test('invalid links never start a download or create an agent', async () => {
  await expect(
    importer.importFromUrl('https://example.com/data.zip', {
      signal: new AbortController().signal,
      onProgress: () => {},
    }),
  ).rejects.toMatchObject({ code: 'invalid-link' });
  expect(downloadFile).not.toHaveBeenCalled();
  expect(sqlite.prepare('SELECT count(*) AS count FROM agent').get()).toEqual({ count: 1 });
});
