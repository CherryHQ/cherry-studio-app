import { Directory, File, Paths } from 'expo-file-system';

import type { FileEntryId } from '@/shared/data/types/file';

import type { ExtractResult } from '../../../../../modules/pdf-text-extractor';
import {
  deleteFileTextCache,
  fileTextCacheFile,
  readFileTextCache,
  resetFileTextCacheForRestore,
  writeFileTextCache,
} from '../fileTextCache';

const mockFiles = new Map<string, { content: string; size: number; time: number }>();
const mockDirectories = new Set<string>();
let mockTime = 1;
jest.mock('expo-file-system', () => {
  const join = (parts: (string | { uri: string })[]) =>
    parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    get name() {
      return this.uri.split('/').at(-1)!;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return mockFiles.get(this.uri)?.size ?? 0;
    }
    get modificationTime() {
      return mockFiles.get(this.uri)?.time ?? null;
    }
    text() {
      return Promise.resolve(mockFiles.get(this.uri)!.content);
    }
    writeSync(content: string) {
      mockFiles.set(this.uri, {
        content,
        size: new TextEncoder().encode(content).length,
        time: mockTime++,
      });
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  }
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockDirectories.has(this.uri);
    }
    create() {
      mockDirectories.add(this.uri);
    }
    list() {
      return [...mockFiles.keys()]
        .filter((key) => key.startsWith(this.uri + '/'))
        .map((key) => new File(key));
    }
    delete() {
      this.list().forEach((file) => file.delete());
      mockDirectories.delete(this.uri);
    }
  }
  return { Directory, File, Paths: { cache: 'file:///cache' } };
});
const result: ExtractResult = {
  text: '扫描文字',
  totalPages: 3,
  extractedPages: 3,
  isTruncated: false,
  extractionError: false,
  ocrError: false,
  ocrUnavailable: false,
  unrecognizedPages: [1],
};
const source = () => new File('file:///documents/00000000-0000-7000-8000-000000000001.pdf');
test('keeps existing system cache keys and isolates local model revisions', async () => {
  const file = source();
  const system = fileTextCacheFile(file, 'en-US');
  expect(fileTextCacheFile(file, 'en-US', 'pdf', 'system').uri).toBe(system.uri);
  const local = fileTextCacheFile(file, 'en-US', 'pdf', 'xiaomi-v1');
  expect(local.uri).not.toBe(system.uri);
  expect(fileTextCacheFile(file, 'en-US', 'pdf', 'xiaomi-v2').uri).not.toBe(local.uri);
  writeFileTextCache(system, result);
  writeFileTextCache(local, { ...result, text: 'Structured table' });
  await expect(readFileTextCache(system)).resolves.toMatchObject({ text: result.text });
  await expect(readFileTextCache(local)).resolves.toMatchObject({ text: 'Structured table' });
});
beforeEach(() => {
  mockFiles.clear();
  mockDirectories.clear();
  mockTime = 1;
});

test('persists the complete extraction result across reader instances without device paths', async () => {
  source().writeSync('pdf bytes');
  const cache = fileTextCacheFile(source(), 'zh-CN');
  writeFileTextCache(cache, result);
  await expect(readFileTextCache(new File(cache.uri))).resolves.toEqual(result);
  expect(await cache.text()).not.toContain('file:///');
  const relocated = new File('file:///new-sandbox/00000000-0000-7000-8000-000000000001.pdf');
  mockFiles.set(relocated.uri, mockFiles.get(source().uri)!);
  expect(fileTextCacheFile(relocated, 'zh-CN').uri).toBe(cache.uri);
});

test('invalidates a replaced source and rejects truncated cache writes', async () => {
  source().writeSync('pdf bytes');
  const original = fileTextCacheFile(source(), 'zh-CN');
  writeFileTextCache(original, result);
  source().writeSync('replacement');
  expect(fileTextCacheFile(source(), 'zh-CN').uri).not.toBe(original.uri);
  // Recognition languages follow the app language.
  expect(fileTextCacheFile(source(), 'ru-RU').uri).not.toBe(
    fileTextCacheFile(source(), 'zh-CN').uri,
  );
  expect(fileTextCacheFile(source(), 'zh-CN', 'image').uri).not.toBe(
    fileTextCacheFile(source(), 'zh-CN', 'pdf').uri,
  );
  await expect(readFileTextCache(fileTextCacheFile(source(), 'zh-CN'))).resolves.toBeUndefined();
  original.writeSync('{"text":');
  await expect(readFileTextCache(original)).resolves.toBeUndefined();
});

test('never persists parser or recognition engine failures', () => {
  const cache = fileTextCacheFile(source(), 'zh-CN');
  writeFileTextCache(cache, { ...result, extractionError: true });
  expect(cache.exists).toBe(false);
  writeFileTextCache(cache, { ...result, ocrError: true });
  expect(cache.exists).toBe(false);
});

test('evicts old disk entries when retained bytes exceed the cache ceiling', () => {
  const folder = new Directory(Paths.cache, 'PdfText');
  folder.create();
  const older = new File(folder, 'old.json');
  const newer = new File(folder, 'newer.json');
  mockFiles.set(older.uri, { content: '{}', size: 40 * 1024 * 1024, time: 1 });
  mockFiles.set(newer.uri, { content: '{}', size: 40 * 1024 * 1024, time: 2 });
  mockTime = 3;
  writeFileTextCache(fileTextCacheFile(source(), 'zh-CN'), result);
  expect(older.exists).toBe(false);
  expect(newer.exists).toBe(true);
});

test('hard deletion removes only that entry; restore clears all derived PDF text', () => {
  const cache = fileTextCacheFile(source(), 'zh-CN');
  const other = fileTextCacheFile(new File('file:///documents/other.pdf'), 'zh-CN');
  writeFileTextCache(cache, result);
  writeFileTextCache(other, result);
  deleteFileTextCache({ id: '00000000-0000-7000-8000-000000000001' as FileEntryId });
  expect(cache.exists).toBe(false);
  expect(other.exists).toBe(true);
  resetFileTextCacheForRestore();
  expect(other.exists).toBe(false);
});
