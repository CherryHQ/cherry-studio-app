import { Directory, File, Paths } from 'expo-file-system';

import type { FileEntryId } from '@/shared/data/types/file';

import type { ExtractResult } from '../../../../../modules/pdf-text-extractor';
import {
  deletePdfTextCache,
  pdfTextCacheFile,
  readPdfTextCache,
  resetPdfTextCacheForRestore,
  writePdfTextCache,
} from '../pdfTextCache';

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
    write(content: string) {
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
  unrecognizedPages: [1],
};
const source = () => new File('file:///documents/00000000-0000-7000-8000-000000000001.pdf');
beforeEach(() => {
  mockFiles.clear();
  mockDirectories.clear();
  mockTime = 1;
});

test('persists the complete extraction result across reader instances without device paths', async () => {
  source().write('pdf bytes');
  const cache = pdfTextCacheFile(source());
  writePdfTextCache(cache, result);
  await expect(readPdfTextCache(new File(cache.uri))).resolves.toEqual(result);
  expect(await cache.text()).not.toContain('file:///');
  const relocated = new File('file:///new-sandbox/00000000-0000-7000-8000-000000000001.pdf');
  mockFiles.set(relocated.uri, mockFiles.get(source().uri)!);
  expect(pdfTextCacheFile(relocated).uri).toBe(cache.uri);
});

test('invalidates a replaced source and rejects truncated cache writes', async () => {
  source().write('pdf bytes');
  const original = pdfTextCacheFile(source());
  writePdfTextCache(original, result);
  source().write('replacement');
  expect(pdfTextCacheFile(source()).uri).not.toBe(original.uri);
  await expect(readPdfTextCache(pdfTextCacheFile(source()))).resolves.toBeUndefined();
  original.write('{"text":');
  await expect(readPdfTextCache(original)).resolves.toBeUndefined();
});

test('never persists parser or recognition engine failures', () => {
  const cache = pdfTextCacheFile(source());
  writePdfTextCache(cache, { ...result, extractionError: true });
  expect(cache.exists).toBe(false);
  writePdfTextCache(cache, { ...result, ocrError: true });
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
  writePdfTextCache(pdfTextCacheFile(source()), result);
  expect(older.exists).toBe(false);
  expect(newer.exists).toBe(true);
});

test('hard deletion removes only that entry; restore clears all derived PDF text', () => {
  const cache = pdfTextCacheFile(source());
  const other = pdfTextCacheFile(new File('file:///documents/other.pdf'));
  writePdfTextCache(cache, result);
  writePdfTextCache(other, result);
  deletePdfTextCache({ id: '00000000-0000-7000-8000-000000000001' as FileEntryId });
  expect(cache.exists).toBe(false);
  expect(other.exists).toBe(true);
  resetPdfTextCacheForRestore();
  expect(other.exists).toBe(false);
});
