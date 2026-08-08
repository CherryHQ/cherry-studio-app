import { type FileEntry, FileEntrySchema } from '@cherrystudio/universal/data/types/file';
import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';
import { readCherryMeta } from '@cherrystudio/universal/data/types/uiParts';

import type { FileEntryService } from '@/backend/data/services/FileEntryService';

import {
  createInternalEntry,
  createMessageParts,
  deleteInternalFile,
  deleteInternalFileUri,
  discardInternalEntries,
  discardUnreferencedInternalEntry,
  imageUriToDataUrl,
  listInternalFiles,
  resolveFileEntry,
  resolveInternalFileUri,
  resolveRenderableFileUri,
} from '../fileStorage';

jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000001'),
  v7: jest.fn(() => '00000000-0000-7000-8000-000000000001'),
}));

jest.mock('expo-file-system', () => {
  const directories = new Set<string>();
  const files = new Map<string, number>();
  const modificationTimes = new Map<string, number | null>();
  const copies: { destination: string; source: string }[] = [];
  const failures = new Set<string>();
  const writeFailures = new Set<string>();
  const writes: { content: string; options?: unknown; uri: string }[] = [];
  const paths = { document: { uri: 'file:///documents/' } };
  const joinUri = (parts: (string | { uri: string })[], isDirectory: boolean) => {
    const [first, ...rest] = parts.map((part) => (typeof part === 'string' ? part : part.uri));
    let uri = first?.replace(/\/+$/, '') ?? '';

    for (const part of rest) {
      uri += `/${part.replace(/^\/+|\/+$/g, '')}`;
    }

    return isDirectory ? `${uri}/` : uri;
  };

  class MockDirectory {
    readonly uri: string;

    constructor(...parts: (string | { uri: string })[]) {
      this.uri = joinUri(parts, true);
    }

    get exists() {
      return directories.has(this.uri);
    }

    create() {
      directories.add(this.uri);
    }

    list() {
      return [...files.keys()]
        .filter((uri) => uri.startsWith(this.uri) && !uri.slice(this.uri.length).includes('/'))
        .map((uri) => new MockFile(uri));
    }
  }

  class MockFile {
    readonly uri: string;

    constructor(...parts: (string | { uri: string })[]) {
      this.uri = joinUri(parts, false);
    }

    get exists() {
      return files.has(this.uri);
    }

    get name() {
      return this.uri.split('/').pop() ?? '';
    }

    get size() {
      return files.get(this.uri) ?? 0;
    }

    get modificationTime() {
      return modificationTimes.get(this.uri) ?? null;
    }

    get parentDirectory() {
      return new MockDirectory(this.uri.slice(0, this.uri.lastIndexOf('/') + 1));
    }

    get type() {
      return this.uri.endsWith('.jpg') ? 'image/jpeg' : '';
    }

    async base64() {
      return 'encoded';
    }

    async copy(destination: MockFile) {
      copies.push({ destination: destination.uri, source: this.uri });
      files.set(destination.uri, files.get(this.uri) ?? 0);
      if (failures.has(this.uri)) {
        throw new Error(`copy failed: ${this.uri}`);
      }
    }

    delete() {
      files.delete(this.uri);
    }

    write(content: string, options?: unknown) {
      writes.push({ content, options, uri: this.uri });
      files.set(this.uri, content.length);
      if (writeFailures.has(this.uri)) {
        throw new Error(`write failed: ${this.uri}`);
      }
    }
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: paths,
    testState: {
      copies,
      directories,
      failures,
      files,
      modificationTimes,
      paths,
      writeFailures,
      writes,
    },
  };
});

type FileSystemTestState = {
  copies: { destination: string; source: string }[];
  directories: Set<string>;
  failures: Set<string>;
  files: Map<string, number>;
  modificationTimes: Map<string, number | null>;
  paths: { document: { uri: string } };
  writeFailures: Set<string>;
  writes: { content: string; options?: unknown; uri: string }[];
};

const { testState } = jest.requireMock<{ testState: FileSystemTestState }>('expo-file-system');

describe('fileStorage', () => {
  beforeEach(() => {
    testState.copies.length = 0;
    testState.directories.clear();
    testState.failures.clear();
    testState.files.clear();
    testState.modificationTimes.clear();
    testState.writeFailures.clear();
    testState.writes.length = 0;
    testState.paths.document.uri = 'file:///documents/';
  });

  test('copies files with a normalized extension and records their actual size', async () => {
    testState.files.set('file:///picker/brief.PDF', 42);
    const entries = createEntryStore();

    const managed = await createMessageParts(entries, [
      createFilePart('file:///picker/brief.PDF', 'Quarterly Brief.PDF'),
    ]);

    expect(managed.entries).toEqual([
      {
        cleanupPolicy: 'delete_when_unreferenced',
        contentHash: null,
        createdAt: 1,
        ext: 'pdf',
        id: '00000000-0000-7000-8000-000000000001',
        name: 'Quarterly Brief',
        origin: 'internal',
        size: 42,
        updatedAt: 1,
      },
    ]);
    expect(entries.create).toHaveBeenCalledWith(
      expect.objectContaining({ cleanupPolicy: 'delete_when_unreferenced', origin: 'internal' }),
    );
    expect(managed.parts[0]).toEqual(
      expect.objectContaining({
        url: 'file:///documents/Data/Files/00000000-0000-7000-8000-000000000001.pdf',
      }),
    );
    const managedPart = managed.parts[0];
    expect(managedPart.type).toBe('file');
    if (managedPart.type !== 'file') {
      throw new Error('Expected a managed file part');
    }
    expect(readCherryMeta(managedPart)?.fileEntryId).toBe('00000000-0000-7000-8000-000000000001');
  });

  test('stores extensionless files without a trailing dot', async () => {
    testState.files.set('file:///picker/README', 7);

    const managed = await createMessageParts(createEntryStore(), [
      createFilePart('file:///picker/README', 'README'),
    ]);

    expect(managed.entries[0]).toEqual(
      expect.objectContaining({
        ext: null,
        name: 'README',
      }),
    );
  });

  test('uses the source extension when a camera display name has none', async () => {
    testState.files.set('file:///camera/IMG_0001.JPG', 128);

    const managed = await createMessageParts(createEntryStore(), [
      createFilePart('file:///camera/IMG_0001.JPG', 'Photo'),
    ]);

    expect(managed.entries[0]).toEqual(expect.objectContaining({ ext: 'jpg', name: 'Photo' }));
  });

  test('rebuilds managed paths from the current document directory', () => {
    const entry = {
      ext: 'png',
      id: '00000000-0000-7000-8000-000000000001',
    } as const;
    testState.files.set(
      'file:///documents/Data/Files/00000000-0000-7000-8000-000000000001.png',
      10,
    );
    expect(resolveInternalFileUri(entry)).toBe(
      'file:///documents/Data/Files/00000000-0000-7000-8000-000000000001.png',
    );

    testState.paths.document.uri = 'file:///new-sandbox/Documents/';
    testState.files.set(
      'file:///new-sandbox/Documents/Data/Files/00000000-0000-7000-8000-000000000001.png',
      10,
    );
    expect(resolveInternalFileUri(entry)).toBe(
      'file:///new-sandbox/Documents/Data/Files/00000000-0000-7000-8000-000000000001.png',
    );
  });

  test('resolves persisted entries against the current document directory', async () => {
    const entries = createEntryStore();
    const entry = FileEntrySchema.parse({
      cleanupPolicy: 'manual',
      contentHash: null,
      createdAt: 1,
      ext: 'png',
      id: '00000000-0000-7000-8000-000000000001',
      name: 'image',
      origin: 'internal',
      size: 10,
      updatedAt: 1,
    });
    entries.stored.set(entry.id, entry);
    testState.paths.document.uri = 'file:///new-sandbox/Documents/';
    const uri = 'file:///new-sandbox/Documents/Data/Files/00000000-0000-7000-8000-000000000001.png';
    testState.files.set(uri, 10);

    await expect(resolveFileEntry(entries, entry.id)).resolves.toEqual({ entry, uri });
    await expect(resolveRenderableFileUri(entries, entry.id)).resolves.toBe(uri);
  });

  test('keeps external entries opaque instead of resolving their paths', async () => {
    const entries = createEntryStore();
    const entry = FileEntrySchema.parse({
      cleanupPolicy: 'manual',
      createdAt: 1,
      ext: 'png',
      externalPath: '/user-selected/image.png',
      id: '00000000-0000-7000-8000-000000000001',
      name: 'image',
      origin: 'external',
      updatedAt: 1,
    });
    entries.stored.set(entry.id, entry);

    await expect(resolveFileEntry(entries, entry.id)).resolves.toBeNull();
    await expect(resolveRenderableFileUri(entries, entry.id)).resolves.toBeUndefined();
  });

  test('removes every copied destination when a later copy fails partially', async () => {
    testState.files.set('file:///picker/first.txt', 1);
    testState.files.set('file:///picker/second.txt', 2);
    testState.failures.add('file:///picker/second.txt');
    const entries = createEntryStore();

    await expect(
      createMessageParts(entries, [
        createFilePart('file:///picker/first.txt', 'first.txt'),
        createFilePart('file:///picker/second.txt', 'second.txt'),
      ]),
    ).rejects.toThrow('copy failed');

    expect([...testState.files.keys()]).toEqual([
      'file:///picker/first.txt',
      'file:///picker/second.txt',
    ]);
    expect(entries.delete).toHaveBeenCalledWith('00000000-0000-7000-8000-000000000001');
  });

  test('writes generated base64 and persists its internal entry', async () => {
    const entries = createEntryStore();
    const entry = await createInternalEntry(entries, {
      cleanupPolicy: 'delete_when_unreferenced',
      data: 'data:image/png;base64,AAAA',
      mediaType: 'image/png',
      source: 'base64',
    });

    expect(entry).toEqual(
      expect.objectContaining({
        ext: 'png',
        size: 4,
      }),
    );
    expect(testState.writes).toEqual([
      expect.objectContaining({ content: 'AAAA', options: { encoding: 'base64' } }),
    ]);
  });

  test('removes a partially written generated image on failure', async () => {
    const uri = 'file:///documents/Data/Files/00000000-0000-7000-8000-000000000001.png';
    testState.writeFailures.add(uri);

    await expect(
      createInternalEntry(createEntryStore(), {
        cleanupPolicy: 'delete_when_unreferenced',
        data: 'AAAA',
        mediaType: 'image/png',
        source: 'base64',
      }),
    ).rejects.toThrow('write failed');
    expect(testState.files.has(uri)).toBe(false);
  });

  test('removes the managed blob when FileEntry persistence fails', async () => {
    testState.files.set('file:///picker/brief.txt', 42);
    const entries = createEntryStore();
    entries.create.mockRejectedValueOnce(new Error('database failed'));

    await expect(
      createInternalEntry(entries, {
        cleanupPolicy: 'manual',
        name: 'brief.txt',
        source: 'uri',
        uri: 'file:///picker/brief.txt',
      }),
    ).rejects.toThrow('database failed');

    expect(
      testState.files.has('file:///documents/Data/Files/00000000-0000-7000-8000-000000000001.txt'),
    ).toBe(false);
  });

  test('keeps the managed blob when discarding its FileEntry fails', async () => {
    testState.files.set('file:///picker/brief.txt', 42);
    const entries = createEntryStore();
    const entry = await createInternalEntry(entries, {
      cleanupPolicy: 'delete_when_unreferenced',
      name: 'brief.txt',
      source: 'uri',
      uri: 'file:///picker/brief.txt',
    });
    entries.delete.mockRejectedValueOnce(new Error('file is referenced'));

    await discardInternalEntries(entries, [entry]);

    expect(
      testState.files.has('file:///documents/Data/Files/00000000-0000-7000-8000-000000000001.txt'),
    ).toBe(true);
  });

  test('discards an unreferenced managed entry and its file', async () => {
    const entry = internalEntry();
    const uri = `file:///documents/Data/Files/${entry.id}.txt`;
    testState.files.set(uri, entry.size);
    const tx = {};
    const entries = {
      deleteTx: jest.fn(async () => undefined),
      findByIdTx: jest.fn(async () => entry),
      withWriteTx: jest.fn(async (callback: (value: unknown) => Promise<unknown>) => callback(tx)),
    };
    const refs = { countPersistentRefsByEntryIdTx: jest.fn(async () => 0) };

    await expect(
      discardUnreferencedInternalEntry(entries as never, refs as never, entry.id),
    ).resolves.toBe(true);

    expect(entries.deleteTx).toHaveBeenCalledWith(tx, entry.id);
    expect(testState.files.has(uri)).toBe(false);
  });

  test('keeps managed entries that have persistent references', async () => {
    const entry = internalEntry();
    const entries = {
      deleteTx: jest.fn(async () => undefined),
      findByIdTx: jest.fn(async () => entry),
      withWriteTx: jest.fn(async (callback: (value: unknown) => Promise<unknown>) => callback({})),
    };
    const refs = { countPersistentRefsByEntryIdTx: jest.fn(async () => 1) };

    await expect(
      discardUnreferencedInternalEntry(entries as never, refs as never, entry.id),
    ).resolves.toBe(false);
    expect(entries.deleteTx).not.toHaveBeenCalled();
  });

  test('resolves a local image as a data URL', async () => {
    await expect(imageUriToDataUrl('file:///picker/photo.jpg', 'image/*')).resolves.toBe(
      'data:image/jpeg;base64,encoded',
    );
  });

  test('enumerates only UUID files with a safe optional extension', () => {
    const directory = 'file:///documents/Data/Files/';
    testState.directories.add(directory);
    const valid = `${directory}00000000-0000-7000-8000-000000000001.png`;
    const extensionless = `${directory}00000000-0000-7000-8000-000000000002`;
    testState.files.set(valid, 1);
    testState.files.set(extensionless, 2);
    testState.files.set(`${directory}00000000-0000-7000-8000-000000000003.bad.ext`, 3);
    testState.files.set(`${directory}not-an-id.png`, 4);
    testState.modificationTimes.set(valid, 10);
    testState.modificationTimes.set(extensionless, 20);

    expect(listInternalFiles()).toEqual([
      {
        id: '00000000-0000-7000-8000-000000000001',
        modificationTime: 10,
        name: '00000000-0000-7000-8000-000000000001.png',
        uri: valid,
      },
      {
        id: '00000000-0000-7000-8000-000000000002',
        modificationTime: 20,
        name: '00000000-0000-7000-8000-000000000002',
        uri: extensionless,
      },
    ]);
  });

  test('deletes only managed Data/Files paths', () => {
    const uri = 'file:///documents/Data/Files/00000000-0000-7000-8000-000000000001.png';
    testState.files.set(uri, 1);

    expect(deleteInternalFile({ ext: 'png', id: '00000000-0000-7000-8000-000000000001' })).toBe(
      true,
    );
    expect(testState.files.has(uri)).toBe(false);
    expect(() => deleteInternalFileUri('file:///tmp/outside.png')).toThrow('outside Data/Files');
  });
});

function createEntryStore() {
  const stored = new Map<string, FileEntry>();
  const create = jest.fn(
    async (values: Parameters<FileEntryService['create']>[0]): Promise<FileEntry> => {
      const entry = FileEntrySchema.parse({ ...values, createdAt: 1, updatedAt: 1 });
      stored.set(entry.id, entry);
      return entry;
    },
  );
  const deleteEntry = jest.fn(async (id: string) => {
    stored.delete(id);
  });

  return {
    create,
    delete: deleteEntry,
    findById: jest.fn(async (id: string) => stored.get(id) ?? null),
    stored,
  };
}

function createFilePart(url: string, filename: string): CherryMessagePart {
  return {
    filename,
    mediaType: 'application/octet-stream',
    type: 'file',
    url,
  };
}

function internalEntry(): Extract<FileEntry, { origin: 'internal' }> {
  return FileEntrySchema.parse({
    cleanupPolicy: 'delete_when_unreferenced',
    contentHash: null,
    createdAt: 1,
    ext: 'txt',
    id: '00000000-0000-7000-8000-000000000001',
    name: 'notes',
    origin: 'internal',
    size: 12,
    updatedAt: 1,
  }) as Extract<FileEntry, { origin: 'internal' }>;
}
