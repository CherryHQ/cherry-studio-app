import { DatabaseSync } from 'node:sqlite';

import type { PreferenceService } from '@/backend/data/PreferenceService';
import { createTestDb } from '@/backend/data/services/__tests__/_testDb';
import { downloadFile } from '@/backend/services/download';
import { importManagedFile } from '@/backend/services/file/importManagedFile';
import { FileEntrySchema } from '@/shared/data/types/file';

import { DeepseekImportRuntime } from '../DeepseekImportRuntime';

const mockConversations = new Map<string, unknown>();
const mockArchiveFiles = new Map<string, string>();
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
  readDeepseekImageMediaType: () => 'image/png',
  readDeepseekJson: async (file: { uri: string }) => mockConversations.get(file.uri),
  unpackDeepseekArchive: async () => ({
    conversations: ['first', 'second'].map((id) => ({ id, insertedAt: 1, updatedAt: 2 })),
    files: mockArchiveFiles,
  }),
}));

const url =
  'https://deepseek-chat-history-exports-prod.obs.cn-east-3.myhuaweicloud.com/00000000-0000-4000-8000-000000000001.zip?response-content-disposition=attachment%3B%20filename%3Ddeepseek_data-2026-11-17.zip&Expires=4102444800&AccessKeyId=EXAMPLE&Signature=example%3D';
let sqlite: DatabaseSync;
let db: ReturnType<typeof createTestDb>;
let importer: DeepseekImportRuntime;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(importManagedFile).mockReset();
  mockArchiveFiles.clear();
  sqlite = new DatabaseSync(':memory:');
  db = createTestDb(sqlite);
  importer = new DeepseekImportRuntime(db.dbService, {
    get: async () => null,
  } as unknown as PreferenceService);
  sqlite.exec(
    "INSERT INTO agent (id, name, order_key, created_at, updated_at) VALUES ('existing', 'Existing', 'a0', 1, 1)",
  );
  mockConversations.clear();
  for (const id of ['first', 'second']) {
    const path = `chat_sessions/${id}.json`;
    mockArchiveFiles.set(path, path);
    mockConversations.set(path, {
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
  }
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
  expect(result).toMatchObject({
    sessions: 2,
    messages: 4,
    missingAttachments: 0,
    skippedConversations: 0,
  });
  expect(sqlite.prepare('SELECT id, name, avatar FROM agent ORDER BY name').all()).toEqual([
    { id: result.agentId, name: 'DeepSeek', avatar: 'builtin:deepseek' },
    { id: 'existing', name: 'Existing', avatar: null },
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
  expect(sqlite.prepare('SELECT avatar FROM agent WHERE id = ?').get(second.agentId)).toEqual({
    avatar: 'builtin:deepseek',
  });
  expect(sqlite.prepare('SELECT count(*) AS count FROM agent').get()).toEqual({ count: 3 });
});

test('imports a mixed archive without letting an empty conversation block other messages', async () => {
  mockConversations.set('chat_sessions/first.json', {
    id: 'first',
    title: 'Empty conversation',
    current_message_id: 0,
    inserted_at: '2026-11-01T00:00:00Z',
    messages: [],
  });
  const result = await importer.importFromUrl(url, {
    signal: new AbortController().signal,
    onProgress: () => {},
  });
  expect(result).toMatchObject({ sessions: 2, messages: 2 });
  expect(
    sqlite
      .prepare('SELECT active_node_id FROM agent_session WHERE name = ?')
      .get('Empty conversation'),
  ).toEqual({ active_node_id: null });
  expect(sqlite.prepare('SELECT count(*) AS count FROM agent_session_message').get()).toEqual({
    count: 2,
  });
});

test.each([
  undefined,
  'not json',
  { messages: 'not a list' },
  { messages: [{ id: 'bad', role: 'USER' }] },
  { messages: [{ id: 2, parent_id: 1, role: 'ASSISTANT' }] },
])('skips an unreadable conversation %p and imports the rest', async (content) => {
  mockConversations.set('chat_sessions/first.json', content);
  const result = await importer.importFromUrl(url, {
    signal: new AbortController().signal,
    onProgress: () => {},
  });
  expect(result).toMatchObject({ sessions: 1, skippedConversations: 1, messages: 2 });
  expect(sqlite.prepare('SELECT count(*) AS count FROM agent_session_message').get()).toEqual({
    count: 2,
  });
});

test('counts a failed ZIP entry as skipped and counts only the messages that were saved', async () => {
  mockArchiveFiles.delete('chat_sessions/first.json');
  const second = mockConversations.get('chat_sessions/second.json') as { messages: unknown[] };
  second.messages.unshift({ id: 0, parent_id: null, role: 'ASSISTANT' });

  const result = await importer.importFromUrl(url, {
    signal: new AbortController().signal,
    onProgress: () => {},
  });

  expect(result).toMatchObject({ sessions: 1, skippedConversations: 1, messages: 2 });
  expect(sqlite.prepare('SELECT name FROM agent_session').all()).toEqual([{ name: 'second' }]);
});

test('rejects an archive with no readable conversation without creating an agent', async () => {
  mockConversations.clear();
  await expect(
    importer.importFromUrl(url, { signal: new AbortController().signal, onProgress: () => {} }),
  ).rejects.toMatchObject({ code: 'invalid' });
  expect(sqlite.prepare('SELECT count(*) AS count FROM agent').get()).toEqual({ count: 1 });
});

test('rejects an entirely empty archive without creating an imported agent', async () => {
  for (const id of ['first', 'second'])
    mockConversations.set(`chat_sessions/${id}.json`, {
      id,
      title: id,
      current_message_id: 0,
      inserted_at: '2026-11-01T00:00:00Z',
      messages: [],
    });
  await expect(
    importer.importFromUrl(url, { signal: new AbortController().signal, onProgress: () => {} }),
  ).rejects.toMatchObject({ code: 'empty' });
  expect(sqlite.prepare('SELECT count(*) AS count FROM agent').get()).toEqual({ count: 1 });
  expect(sqlite.prepare('SELECT count(*) AS count FROM agent_session').get()).toEqual({ count: 0 });
});

test.each(['scan', 'photo.txt', 'photo.PNG'])(
  'imports a present image named %s and stores its canonical file metadata',
  async (filename) => {
    const path = `chat_sessions/first_files/image_${filename}`;
    mockArchiveFiles.set(path, path);
    mockConversations.set('chat_sessions/first.json', {
      id: 'first',
      title: 'Image conversation',
      current_message_id: 1,
      inserted_at: '2026-11-01T00:00:00Z',
      messages: [
        {
          id: 1,
          parent_id: null,
          role: 'USER',
          status: 'FINISHED',
          inserted_at: '2026-11-01T00:00:00Z',
          fragments: [
            {
              type: 'FILE',
              files: [{ id: 'image', file_name: filename, is_image: true, export_path: path }],
            },
          ],
        },
      ],
    });
    const entry = FileEntrySchema.parse({
      id: '00000000-0000-4000-8000-000000000001',
      filename: 'scan.jpg',
      mediaType: 'image/jpeg',
      size: 700_000,
      provenance: 'imported',
      createdAt: 1,
      updatedAt: 1,
    });
    jest.mocked(importManagedFile).mockResolvedValue(entry);
    const result = await importer.importFromUrl(url, {
      signal: new AbortController().signal,
      onProgress: () => {},
    });
    expect(result).toMatchObject({ sessions: 2, messages: 3, missingAttachments: 0 });
    expect(importManagedFile).toHaveBeenCalledWith(
      expect.anything(),
      { uri: path, name: filename, mediaType: 'image/png' },
      expect.anything(),
    );
    const row = sqlite
      .prepare(`SELECT data FROM agent_session_message WHERE data LIKE '%fileEntryId%'`)
      .get() as { data: string };
    expect(JSON.parse(row.data).parts).toEqual([
      expect.objectContaining({
        type: 'file',
        fileEntryId: entry.id,
        filename: entry.filename,
        mediaType: entry.mediaType,
      }),
    ]);
  },
);

test('an image that cannot be imported becomes a missing attachment instead of failing', async () => {
  const path = 'elsewhere/photo.png';
  mockArchiveFiles.set(path, path);
  const conversation = mockConversations.get('chat_sessions/first.json') as {
    messages: { fragments: unknown[] }[];
  };
  conversation.messages[0].fragments.push({
    type: 'FILE',
    files: [{ id: 'image', file_name: 'a/b.png', is_image: true, export_path: path }],
  });
  jest.mocked(importManagedFile).mockRejectedValue(new Error('decode failed'));
  const result = await importer.importFromUrl(url, {
    signal: new AbortController().signal,
    onProgress: () => {},
  });
  expect(importManagedFile).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ uri: path, name: 'a_b.png' }),
    expect.anything(),
  );
  expect(result).toMatchObject({ sessions: 2, missingAttachments: 1 });
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

test.each([
  ['https://example.com/data.zip', 'invalid-link'],
  ['https://chat.deepseek.com/share/example', 'share-link'],
])('rejected links never start a download or create an agent (%s)', async (link, code) => {
  await expect(
    importer.importFromUrl(link, {
      signal: new AbortController().signal,
      onProgress: () => {},
    }),
  ).rejects.toMatchObject({ code });
  expect(downloadFile).not.toHaveBeenCalled();
  expect(sqlite.prepare('SELECT count(*) AS count FROM agent').get()).toEqual({ count: 1 });
});
