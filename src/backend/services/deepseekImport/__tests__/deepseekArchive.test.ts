import { Directory, File } from 'expo-file-system';
import { strToU8, zipSync } from 'fflate';

import { readDeepseekImageMediaType, unpackDeepseekArchive } from '../deepseekArchive';

const mockFiles = new Map<string, Uint8Array>();
jest.mock('expo-file-system', () => {
  class Entry {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    create() {}
  }
  class MemoryFile extends Entry {
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return mockFiles.get(this.uri)?.length ?? 0;
    }
    override create() {
      mockFiles.set(this.uri, new Uint8Array());
    }
    delete() {
      mockFiles.delete(this.uri);
    }
    async text() {
      return new TextDecoder().decode(mockFiles.get(this.uri)!);
    }
    open() {
      const uri = this.uri;
      return {
        offset: 0,
        readBytesSync(length: number) {
          return mockFiles.get(uri)!.slice(this.offset, this.offset + length);
        },
        writeBytesSync(chunk: Uint8Array) {
          const current = mockFiles.get(uri)!;
          const next = new Uint8Array(current.length + chunk.length);
          next.set(current);
          next.set(chunk, current.length);
          mockFiles.set(uri, next);
        },
        close() {},
      };
    }
  }
  return {
    File: MemoryFile,
    Directory: Entry,
    FileMode: { ReadOnly: 'r', WriteOnly: 'w' },
    Paths: { availableDiskSpace: Number.MAX_SAFE_INTEGER },
  };
});

const json = (value: unknown) => strToU8(JSON.stringify(value));
async function unpackArchive(archive: Uint8Array) {
  mockFiles.clear();
  mockFiles.set('file:///export.zip', archive);
  return unpackDeepseekArchive(
    new File('file:///export.zip'),
    new Directory('file:///contents'),
    new AbortController().signal,
    () => {},
  );
}

function unpack(entries: Record<string, Uint8Array>) {
  return unpackArchive(zipSync(entries));
}

test('imports indexed and unindexed conversation files, skipping unusable entries', async () => {
  const result = await unpack({
    'chat_session_index.json': json([
      { id: 'a', inserted_at: '2026-11-01T00:00:00Z', updated_at: 1_790_000_000 },
      { id: 'missing', inserted_at: '2026-11-01T00:00:00Z' },
      { broken: true },
    ]),
    'chat_sessions/a.json': json({ messages: [] }),
    'chat_sessions/b.json': json({ messages: [] }),
    'chat_sessions/A.json': json({ messages: [] }),
    'chat_sessions/b.json/nested.txt': strToU8('independent entry'),
    'chat_sessions/a_files/10:30.png': new Uint8Array([1]),
    'chat_sessions/a_files/photo.png': new Uint8Array([1]),
  });
  expect(result.conversations).toEqual([
    { id: 'a', insertedAt: Date.parse('2026-11-01T00:00:00Z'), updatedAt: 1_790_000_000_000 },
    { id: 'b' },
    { id: 'A' },
  ]);
  expect([...result.files.keys()].sort()).toEqual([
    'chat_session_index.json',
    'chat_sessions/A.json',
    'chat_sessions/a.json',
    'chat_sessions/a_files/photo.png',
    'chat_sessions/b.json',
    'chat_sessions/b.json/nested.txt',
  ]);
  expect(new Set(result.files.values()).size).toBe(result.files.size);
});

test.each(['chat_sessions/broken.json', 'chat_sessions/valid_files/photo.png'])(
  'continues after a CRC mismatch in %s without making the damaged bytes readable',
  async (damaged) => {
    const archive = zipSync(
      { [damaged]: json({ messages: [] }), 'chat_sessions/valid.json': json({ messages: [] }) },
      { level: 0 },
    );
    const header = new DataView(archive.buffer, archive.byteOffset);
    archive[30 + header.getUint16(26, true) + header.getUint16(28, true)] ^= 1;

    const result = await unpackArchive(archive);

    expect(result.conversations).toContainEqual({ id: 'valid' });
    if (damaged.endsWith('.json')) expect(result.conversations).toContainEqual({ id: 'broken' });
    expect(result.files.has(damaged)).toBe(false);
    expect(mockFiles.size).toBe(2); // The downloaded ZIP and the healthy staged entry.
    expect(mockFiles.get(result.files.get('chat_sessions/valid.json')!)).toEqual(
      json({ messages: [] }),
    );
  },
);

test('distinguishes a response without a ZIP directory', async () => {
  await expect(unpackArchive(strToU8('<html>not an export</html>'))).rejects.toMatchObject({
    code: 'invalid',
    reasonCode: 'missing-directory',
  });
});

test('reads conversation files without a manifest or a readable index', async () => {
  const result = await unpack({
    'chat_session_index.json': strToU8('not json'),
    'chat_sessions/only.json': json({ messages: [] }),
  });
  expect(result.conversations).toEqual([{ id: 'only' }]);
});

test('reports an archive without conversation files as unsupported', async () => {
  await expect(unpack({ 'readme.txt': strToU8('hello') })).rejects.toMatchObject({
    code: 'unsupported',
  });
});

function source(bytes: Uint8Array, size = bytes.length) {
  const handle = { readBytesSync: jest.fn(() => bytes), close: jest.fn() };
  const file = { size, open: jest.fn(() => handle) } as unknown as InstanceType<typeof File>;
  return { file, handle };
}

test.each(['image_scan', 'image_photo.jpg'])(
  'uses PNG bytes rather than the exported filename %s and reads only a bounded prefix',
  (name) => {
    const { file, handle } = source(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      128 * 1024 * 1024,
    );
    expect(readDeepseekImageMediaType(file, name)).toBe('image/png');
    expect(handle.readBytesSync).toHaveBeenCalledWith(32);
    expect(handle.close).toHaveBeenCalledTimes(1);
  },
);

test.each([
  ['image_photo.heic', 'image/heic'],
  ['image_scan', 'image/*'],
])('retains the archive image identity when the header of %s is unknown', (name, mediaType) => {
  const { file, handle } = source(new Uint8Array([1, 2, 3]));
  expect(readDeepseekImageMediaType(file, name)).toBe(mediaType);
  expect(handle.readBytesSync).toHaveBeenCalledWith(3);
  expect(handle.close).toHaveBeenCalledTimes(1);
});

test('closes a source handle if reading the header fails', () => {
  const { file, handle } = source(new Uint8Array());
  handle.readBytesSync.mockImplementation(() => {
    throw new Error('read failed');
  });
  expect(() => readDeepseekImageMediaType(file, 'image_scan')).toThrow('read failed');
  expect(handle.close).toHaveBeenCalledTimes(1);
});
