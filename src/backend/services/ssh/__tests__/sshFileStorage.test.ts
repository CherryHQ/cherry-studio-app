/* eslint-disable @typescript-eslint/no-require-imports -- Jest's isolated native mock uses Node's real filesystem for byte and cleanup regressions. */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createInternalEntryWithPreview } from '@/backend/services/file/filePreviewStorage';

import { cacheSshPreview, createSshStagingFile, SSH_TRANSFER_MAX_BYTES } from '../sshFileStorage';

let mockCacheRoot: string;
let mockMoveGate: Promise<void> | undefined;

jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));
jest.mock('@/backend/data/services/FileEntryService', () => ({ fileEntryService: {} }));
jest.mock('@/backend/services/file/filePreviewStorage', () => ({
  createInternalEntryWithPreview: jest.fn(),
}));
jest.mock('@/backend/services/file/fileStorage', () => ({
  discardInternalEntries: jest.fn(),
  getInternalFileUri: jest.fn(),
  resolveFileEntry: jest.fn(),
}));
jest.mock('expo-file-system', () => {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const { fileURLToPath, pathToFileURL } = require('node:url') as typeof import('node:url');
  class Location {
    path: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.path = path.join(
        ...parts.map((part) => {
          const value = typeof part === 'string' ? part : part.uri;
          return value.startsWith('file:') ? fileURLToPath(value) : value;
        }),
      );
    }
    get uri() {
      return pathToFileURL(this.path).href;
    }
  }
  class Directory extends Location {
    create() {
      fs.mkdirSync(this.path, { recursive: true });
    }
    delete() {
      fs.rmSync(this.path, { recursive: true });
    }
  }
  class File extends Location {
    get size() {
      return fs.existsSync(this.path) ? fs.statSync(this.path).size : 0;
    }
    get type() {
      return path.extname(this.path) === '.txt' ? 'text/plain' : 'application/octet-stream';
    }
    async move(destination: File) {
      await mockMoveGate;
      fs.renameSync(this.path, destination.path);
      this.path = destination.path;
    }
  }
  return {
    Directory,
    File,
    Paths: {
      get cache() {
        return mockCacheRoot;
      },
    },
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockMoveGate = undefined;
  mockCacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-preview-test-'));
});
afterEach(() => fs.rmSync(mockCacheRoot, { recursive: true, force: true }));

test.each(['你好.txt', 'binary.bin', 'odd.%2fescape'])(
  'retains exact bytes for %s in cache without creating a library entry, then releases them',
  async (filename) => {
    const stage = createSshStagingFile();
    const bytes = Buffer.from([0, 255, 65, 0, 128]);
    fs.writeFileSync(stage.path, bytes);
    const preview = await cacheSshPreview(
      stage.file.uri,
      '/remote/' + filename,
      new AbortController().signal,
    );
    stage.dispose();
    const localPath = fileURLToPath(preview.uri);
    expect(path.relative(mockCacheRoot, localPath)).toMatch(
      /^SshPreviews[/\\][^/\\]+[/\\]preview(?:\.[a-z0-9]+)?$/,
    );
    expect(fs.readFileSync(localPath)).toEqual(bytes);
    expect(preview.entry).toMatchObject({ filename, size: bytes.length });
    expect(createInternalEntryWithPreview).not.toHaveBeenCalled();
    preview.release();
    preview.release();
    expect(fs.existsSync(path.dirname(localPath))).toBe(false);
  },
);

test('rejects oversized cache files and removes their bytes rather than retaining a partial preview', async () => {
  const stage = createSshStagingFile();
  fs.writeFileSync(stage.path, '');
  fs.truncateSync(stage.path, SSH_TRANSFER_MAX_BYTES + 1);
  await expect(
    cacheSshPreview(stage.file.uri, 'large.bin', new AbortController().signal),
  ).rejects.toMatchObject({ code: 'file-too-large' });
  stage.dispose();
  expect(fs.readdirSync(path.join(mockCacheRoot, 'SshPreviews'))).toEqual([]);
  expect(createInternalEntryWithPreview).not.toHaveBeenCalled();
});

test('cancelled acquisition and unsafe display names do not retain preview files', async () => {
  const stage = createSshStagingFile();
  fs.writeFileSync(stage.path, 'original');
  const controller = new AbortController();
  controller.abort();
  await expect(cacheSshPreview(stage.file.uri, 'hello.txt', controller.signal)).rejects.toThrow();
  await expect(
    cacheSshPreview(stage.file.uri, '/remote/..', new AbortController().signal),
  ).rejects.toMatchObject({ code: 'path' });
  expect(fs.readFileSync(stage.path, 'utf8')).toBe('original');
  expect(fs.existsSync(path.join(mockCacheRoot, 'SshPreviews'))).toBe(false);
  stage.dispose();
});

test.each([false, true])(
  'holds staging until async move settles, including cancellation=%s',
  async (cancelled) => {
    const stage = createSshStagingFile();
    const bytes = Buffer.from('DELAYED_NATIVE_MOVE');
    fs.writeFileSync(stage.path, bytes);
    let finishMove!: () => void;
    mockMoveGate = new Promise<void>((resolve) => {
      finishMove = resolve;
    });
    const controller = new AbortController();
    const pending = cacheSshPreview(stage.file.uri, 'hello.txt', controller.signal).finally(() =>
      stage.dispose(),
    );
    expect(fs.readFileSync(stage.path)).toEqual(bytes);
    if (cancelled) controller.abort();
    finishMove();
    if (cancelled) {
      await expect(pending).rejects.toThrow();
      expect(fs.readdirSync(path.join(mockCacheRoot, 'SshPreviews'))).toEqual([]);
    } else {
      const preview = await pending;
      expect(fs.readFileSync(fileURLToPath(preview.uri))).toEqual(bytes);
      preview.release();
    }
    expect(fs.existsSync(stage.path)).toBe(false);
    expect(createInternalEntryWithPreview).not.toHaveBeenCalled();
  },
);
