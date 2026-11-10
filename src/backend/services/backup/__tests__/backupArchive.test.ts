import { createHash } from 'node:crypto';

import { Directory, File } from 'expo-file-system';
import { strToU8, unzipSync, Zip, ZipDeflate, ZipPassThrough, zipSync } from 'fflate';

import { packBackup, unpackBackup } from '../backupArchive';
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

    writeSync(data: Uint8Array) {
      files.set(this.uri, data);
    }

    bytes() {
      return Promise.resolve(files.get(this.uri)!);
    }

    open(mode: string) {
      const fileUri = this.uri;
      return {
        offset: 0,
        readBytesSync(length: number) {
          const bytes = files.get(fileUri)!;
          const result = bytes.slice(this.offset, this.offset + length);
          this.offset += result.length;
          mockReadOffsets.set(fileUri, this.offset);
          return result;
        },
        writeBytesSync(bytes: Uint8Array) {
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
jest.mock('@/backend/services/file/fileHash', () => ({
  hashLocalFile: async (uri: string) => {
    const { File: MockFile } =
      jest.requireMock<typeof import('expo-file-system')>('expo-file-system');
    return mockHash(await new MockFile(uri).bytes());
  },
}));

const mockHash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const mockReadOffsets = new Map<string, number>();

test('extracts stored Office files without interpreting their inner ZIP entries as backup entries', async () => {
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
      { path: 'database/cherry.db', size: database.length, sha256: mockHash(database) },
      { path: filePath, size: officeFile.length, sha256: mockHash(officeFile) },
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
  source.writeSync(archive);

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

/** Compression method of each central-directory record, in archive order. */
function compressionMethods(archive: Uint8Array) {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const end = archive.length - 22;
  const methods: [string, number][] = [];
  for (let offset = view.getUint32(end + 16, true); offset < end;) {
    const nameLength = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(archive.subarray(offset + 46, offset + 46 + nameLength));
    methods.push([name, view.getUint16(offset + 10, true)]);
    offset +=
      46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  return methods;
}

test('round-trips a packed backup with deflated metadata and stored payloads', async () => {
  const root = new Directory('file:///cache/export');
  const database = strToU8('database fixture'.repeat(100));
  const filePath = 'files/10000000-0000-4000-8000-000000000002.png';
  const image = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
  const sshSnapshot = strToU8(JSON.stringify({ version: 1, profiles: [] }));
  const manifest: BackupManifest = {
    product: 'cherry-mobile',
    formatVersion: 1,
    id: '20000000-0000-4000-8000-000000000002',
    createdAt: '2026-10-15T00:00:00.000Z',
    appVersion: '0.2.1',
    platform: 'ios',
    migrations: [{ when: 1789461429602, sha256: 'a'.repeat(64) }],
    counts: { sessions: 0, messages: 0, files: 1, pluginConnections: 0 },
    entries: [
      { path: 'database/cherry.db', size: database.length, sha256: mockHash(database) },
      { path: filePath, size: image.length, sha256: mockHash(image) },
      { path: 'ssh/profiles.json', size: sshSnapshot.length, sha256: mockHash(sshSnapshot) },
    ],
  };
  for (const [path, bytes] of [
    ['manifest.json', strToU8(JSON.stringify(manifest))],
    ['database/cherry.db', database],
    [filePath, image],
    ['ssh/profiles.json', sshSnapshot],
  ] as const)
    new File(root, path).writeSync(bytes);
  const output = new File('file:///cache/export.zip');
  const progress: [number, number][] = [];
  await packBackup(root, manifest, output, new AbortController().signal, (done, total) =>
    progress.push([done, total]),
  );
  const payloadBytes = database.length + image.length + sshSnapshot.length;
  expect(progress[0]).toEqual([0, payloadBytes]);
  expect(progress.at(-1)).toEqual([payloadBytes, payloadBytes]);
  for (const [index, [done, total]] of progress.entries()) {
    expect(Number.isSafeInteger(done)).toBe(true);
    expect(total).toBe(payloadBytes);
    expect(done).toBeGreaterThanOrEqual(index === 0 ? 0 : progress[index - 1]![0]);
    expect(done).toBeLessThanOrEqual(total);
  }

  const archive = await output.bytes();
  expect(compressionMethods(archive)).toEqual([
    ['manifest.json', 8],
    ['database/cherry.db', 8],
    [filePath, 0],
    ['ssh/profiles.json', 0],
  ]);
  expect(unzipSync(archive)[filePath]).toEqual(image);
  await expect(
    unpackBackup(
      output,
      new Directory('file:///cache/restored'),
      new AbortController().signal,
      () => {},
    ),
  ).resolves.toEqual(manifest);
  await expect(new File('file:///cache/restored', filePath).bytes()).resolves.toEqual(image);
  await expect(new File('file:///cache/restored/ssh/profiles.json').bytes()).resolves.toEqual(
    sshSnapshot,
  );
});

test('rejects offsetting payload size changes after the manifest was built', async () => {
  const root = new Directory('file:///cache/offsetting-sizes');
  const database = strToU8('database');
  const image = strToU8('image');
  const filePath = 'files/10000000-0000-4000-8000-000000000004.png';
  const manifest: BackupManifest = {
    product: 'cherry-mobile',
    formatVersion: 1,
    id: '20000000-0000-4000-8000-000000000004',
    createdAt: '2026-10-15T00:00:00.000Z',
    appVersion: '0.2.1',
    platform: 'ios',
    migrations: [{ when: 1789461429602, sha256: 'a'.repeat(64) }],
    counts: { sessions: 0, messages: 0, files: 1, pluginConnections: 0 },
    entries: [
      { path: 'database/cherry.db', size: database.length, sha256: mockHash(database) },
      { path: filePath, size: image.length, sha256: mockHash(image) },
    ],
  };
  const manifestBytes = strToU8(JSON.stringify(manifest));
  new File(root, 'manifest.json').writeSync(manifestBytes);
  const databaseFile = new File(root, 'database/cherry.db');
  const imageFile = new File(root, filePath);
  databaseFile.writeSync(database);
  imageFile.writeSync(image);
  databaseFile.writeSync(strToU8('database+'));
  imageFile.writeSync(strToU8('imag'));
  const payloadBytes = manifest.entries.reduce((sum, entry) => sum + entry.size, 0);
  expect(manifestBytes.length + databaseFile.size + imageFile.size).toBe(
    manifestBytes.length + payloadBytes,
  );

  // Without per-file size pinning, the unchanged total lets packing silently write
  // payloads whose sizes disagree with the manifest.
  await expect(
    packBackup(
      root,
      manifest,
      new File('file:///cache/offsetting-sizes.zip'),
      new AbortController().signal,
      () => {},
    ),
  ).rejects.toThrow('ZIP source size does not match expected size');
});

test('reports payload progress before a database-only entry finishes', async () => {
  jest.useFakeTimers();
  const root = new Directory('file:///cache/database-only');
  const database = new Uint8Array(256 * 1024).map((_, index) => index % 251);
  const manifest: BackupManifest = {
    product: 'cherry-mobile',
    formatVersion: 1,
    id: '20000000-0000-4000-8000-000000000003',
    createdAt: '2026-10-15T00:00:00.000Z',
    appVersion: '0.2.1',
    platform: 'ios',
    migrations: [{ when: 1789461429602, sha256: 'a'.repeat(64) }],
    counts: { sessions: 0, messages: 0, files: 0, pluginConnections: 0 },
    entries: [{ path: 'database/cherry.db', size: database.length, sha256: mockHash(database) }],
  };
  const manifestBytes = strToU8(JSON.stringify(manifest));
  expect(manifestBytes.length).toBeLessThan(65536);
  new File(root, 'manifest.json').writeSync(manifestBytes);
  const databaseFile = new File(root, 'database/cherry.db');
  databaseFile.writeSync(database);
  const output = new File('file:///cache/database-only.zip');
  const progress: [number, number][] = [];
  let settled = false;
  const packing = packBackup(root, manifest, output, new AbortController().signal, (done, total) =>
    progress.push([done, total]),
  ).then(() => {
    settled = true;
  });
  // Handle rejection immediately, while retaining it for the awaited assertion path.
  void packing.catch(() => {});
  let cleanupFailure: { error: unknown } | undefined;
  try {
    // The manifest's first chunk has been consumed; its yield is still pending.
    expect(mockReadOffsets.get(new File(root, 'manifest.json').uri)).toBe(manifestBytes.length);
    expect(progress.every(([done]) => done === 0)).toBe(true);
    jest.advanceTimersToNextTimer();
    await Promise.resolve();

    // Resume only the manifest yield, stopping at the first database chunk's yield.
    expect(mockReadOffsets.get(databaseFile.uri)).toBe(65536);
    expect(jest.getTimerCount()).toBe(1);
    expect(settled).toBe(false);
    expect(progress).toContainEqual([65536, 262144]);
    for (const [index, [done, total]] of progress.entries()) {
      expect(total).toBe(262144);
      expect(done).toBeGreaterThanOrEqual(index === 0 ? 0 : progress[index - 1]![0]);
      expect(done).toBeLessThanOrEqual(total);
    }
    const observedPayloadBytes = progress.at(-1)![0];
    expect(Math.floor(((262144 + observedPayloadBytes) / (2 * 262144)) * 100)).toBe(62);
  } finally {
    try {
      await jest.runAllTimersAsync();
      await packing;
    } catch (error) {
      // Cleanup failures must not replace an earlier assertion failure.
      cleanupFailure = { error };
    } finally {
      jest.useRealTimers();
    }
  }
  if (cleanupFailure) throw cleanupFailure.error;
  expect(progress.at(-1)).toEqual([262144, 262144]);
  const extracted = unzipSync(await output.bytes());
  expect(Object.keys(extracted)).toEqual(['manifest.json', 'database/cherry.db']);
  expect(extracted['database/cherry.db']).toEqual(database);
});
