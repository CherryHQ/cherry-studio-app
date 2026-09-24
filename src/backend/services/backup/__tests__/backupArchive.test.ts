import { createHash } from 'node:crypto';

import { Directory, File } from 'expo-file-system';
import { strToU8, Zip, ZipDeflate, ZipPassThrough, zipSync } from 'fflate';

import { backupStorageNative } from '@/backend/data/storage/storagePaths';

import { unpackBackup } from '../backupArchive';
import type { BackupManifest } from '../backupFormat';

jest.mock('expo-file-system', () => {
  const files = new Map<string, Uint8Array>();
  const uri = (...parts: (string | { uri: string })[]) =>
    parts
      .map((part) => (typeof part === 'string' ? part : part.uri))
      .reduce((base, part) => (base ? `${base.replace(/\/$/, '')}/${part}` : part), '');

  class MockDirectory {
    uri: string;

    constructor(...parts: (string | { uri: string })[]) {
      this.uri = uri(...parts);
    }

    create() {}
  }

  class MockFile {
    uri: string;

    constructor(...parts: (string | { uri: string })[]) {
      this.uri = uri(...parts);
    }

    get name() {
      return this.uri.split('/').at(-1)!;
    }

    get parentDirectory() {
      return new MockDirectory(this.uri.slice(0, this.uri.lastIndexOf('/')));
    }

    get exists() {
      return files.has(this.uri);
    }

    get size() {
      return files.get(this.uri)?.length ?? 0;
    }

    create() {
      files.set(this.uri, new Uint8Array());
    }

    write(data: Uint8Array) {
      files.set(this.uri, data);
    }

    bytes() {
      return Promise.resolve(files.get(this.uri)!);
    }

    open(mode: string) {
      const fileUri = this.uri;
      return {
        offset: 0,
        readBytes(length: number) {
          const bytes = files.get(fileUri)!;
          const result = bytes.slice(this.offset, this.offset + length);
          this.offset += result.length;
          return result;
        },
        writeBytes(bytes: Uint8Array) {
          if (mode !== 'write') throw new Error('Read-only handle');
          const old = files.get(fileUri)!;
          const next = new Uint8Array(this.offset + bytes.length);
          next.set(old);
          next.set(bytes, this.offset);
          files.set(fileUri, next);
          this.offset += bytes.length;
        },
        close() {},
      };
    }
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    FileMode: { ReadOnly: 'read', WriteOnly: 'write' },
    Paths: { availableDiskSpace: 2 ** 40 },
  };
});
jest.mock('@/backend/data/storage/storagePaths', () => ({ backupStorageNative: jest.fn() }));

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

test('extracts stored Office files without interpreting their inner ZIP entries as backup entries', async () => {
  jest.mocked(backupStorageNative).mockReturnValue({
    hashFile: async (uri: string) => hash(await new File(uri).bytes()),
  } as ReturnType<typeof backupStorageNative>);

  const database = strToU8('database fixture');
  const officeFile = zipSync({ 'ppt/slides/slide1.xml': strToU8('<slide />') });
  const filePath = 'files/10000000-0000-4000-8000-000000000001.pptx';
  const manifest: BackupManifest = {
    product: 'cherry-mobile',
    formatVersion: 1,
    id: '20000000-0000-4000-8000-000000000001',
    createdAt: '2026-09-24T00:00:00.000Z',
    appVersion: '0.1.0',
    platform: 'android',
    migrations: [{ when: 1789461429602, sha256: 'a'.repeat(64) }],
    counts: { sessions: 0, messages: 0, files: 1, pluginConnections: 0 },
    entries: [
      { path: 'database/cherry.db', size: database.length, sha256: hash(database) },
      { path: filePath, size: officeFile.length, sha256: hash(officeFile) },
    ],
  };
  const chunks: Uint8Array[] = [];
  const zip = new Zip((error, chunk) => {
    if (error) throw error;
    chunks.push(chunk);
  });
  for (const [name, bytes] of [
    ['manifest.json', strToU8(JSON.stringify(manifest))],
    ['database/cherry.db', database],
    [filePath, officeFile],
  ] as const) {
    const entry = name === filePath ? new ZipPassThrough(name) : new ZipDeflate(name);
    zip.add(entry);
    entry.push(bytes, false);
    entry.push(new Uint8Array(), true);
  }
  zip.end();
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const archive = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    archive.set(chunk, offset);
    offset += chunk.length;
  }
  const source = new File('file:///cache/source.zip');
  source.write(archive);

  await expect(
    unpackBackup(
      source,
      new Directory('file:///cache/extracted'),
      new AbortController().signal,
      () => {},
    ),
  ).resolves.toEqual(manifest);
  await expect(new File('file:///cache/extracted', filePath).bytes()).resolves.toEqual(officeFile);
});
