import type { FileEntryService } from '@/backend/data/services/FileEntryService';
import { type FileEntry, FileEntrySchema, fileEntryUrl } from '@/shared/data/types/file';
import type { CherryMessagePart } from '@/shared/data/types/message';
import { readCherryMeta } from '@/shared/data/types/uiParts';

import {
  createInternalEntry,
  createMessageParts,
  deleteInternalEntry,
  deleteInternalFile,
  discardInternalEntries,
  getFileUri,
  getInternalFileUri,
  imageUriToDataUrl,
  readFileUriBytes,
  resolveFileEntry,
} from '../fileStorage';

jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000001'),
  v7: jest.fn(() => '00000000-0000-7000-8000-000000000001'),
}));

jest.mock('expo-file-system', () => {
  const directories = new Set<string>();
  const files = new Map<string, number>();
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

    get type() {
      return this.uri.endsWith('.jpg') ? 'image/jpeg' : '';
    }

    async base64() {
      return 'encoded';
    }

    async bytes() {
      return Uint8Array.from([116, 101, 120, 116]);
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
        createdAt: 1,
        filename: 'Quarterly Brief.pdf',
        id: '00000000-0000-7000-8000-000000000001',
        mediaType: 'application/octet-stream',
        provenance: 'imported',
        size: 42,
        updatedAt: 1,
      },
    ]);
    expect(entries.create).toHaveBeenCalledWith({
      filename: 'Quarterly Brief.pdf',
      id: '00000000-0000-7000-8000-000000000001',
      mediaType: 'application/octet-stream',
      provenance: 'imported',
      size: 42,
    });
    expect(
      testState.files.has('file:///documents/Data/Files/00000000-0000-7000-8000-000000000001.pdf'),
    ).toBe(true);
    const managedPart = managed.parts[0];
    expect(managedPart.type).toBe('file');
    if (managedPart.type !== 'file') {
      throw new Error('Expected a managed file part');
    }
    expect(managedPart.url).toBe(fileEntryUrl(managed.entries[0].id));
    expect(managedPart.url).toBe('cherry://file/00000000-0000-7000-8000-000000000001');
    expect(managedPart.mediaType).toBe('application/octet-stream');
    expect(readCherryMeta(managedPart)?.fileEntryId).toBe('00000000-0000-7000-8000-000000000001');
  });

  test('stores extensionless files without a trailing dot', async () => {
    testState.files.set('file:///picker/README', 7);

    const managed = await createMessageParts(createEntryStore(), [
      createFilePart('file:///picker/README', 'README'),
    ]);

    expect(managed.entries[0]).toEqual(expect.objectContaining({ filename: 'README' }));
    expect(
      testState.files.has('file:///documents/Data/Files/00000000-0000-7000-8000-000000000001'),
    ).toBe(true);
  });

  test('uses the source extension when a camera display name has none', async () => {
    testState.files.set('file:///camera/IMG_0001.JPG', 128);

    const managed = await createMessageParts(createEntryStore(), [
      createFilePart('file:///camera/IMG_0001.JPG', 'Photo'),
    ]);

    expect(managed.entries[0]).toEqual(expect.objectContaining({ filename: 'Photo.jpg' }));
  });

  test('folds an unsafe extension into the filename so writes and reads agree', async () => {
    testState.files.set('file:///picker/report', 9);
    const entries = createEntryStore();

    const entry = await createInternalEntry(entries, {
      name: 'report.final version',
      provenance: 'imported',
      source: 'uri',
      uri: 'file:///picker/report',
    });

    expect(entry.filename).toBe('report.final version');
    const extensionlessUri = 'file:///documents/Data/Files/00000000-0000-7000-8000-000000000001';
    expect(testState.files.has(extensionlessUri)).toBe(true);
    expect(getInternalFileUri(entry)).toBe(extensionlessUri);
  });

  test('resolves the media type from the picker, then the source file, then the fallback', async () => {
    testState.files.set('file:///camera/IMG_0001.jpg', 8);
    testState.files.set('file:///picker/unknown.bin', 8);
    const entries = createEntryStore();

    const fromSource = await createInternalEntry(entries, {
      provenance: 'imported',
      source: 'uri',
      uri: 'file:///camera/IMG_0001.jpg',
    });
    expect(fromSource.mediaType).toBe('image/jpeg');

    const fromInput = await createInternalEntry(entries, {
      mediaType: 'image/heic',
      provenance: 'imported',
      source: 'uri',
      uri: 'file:///camera/IMG_0001.jpg',
    });
    expect(fromInput.mediaType).toBe('image/heic');

    const fallback = await createInternalEntry(entries, {
      provenance: 'imported',
      source: 'uri',
      uri: 'file:///picker/unknown.bin',
    });
    expect(fallback.mediaType).toBe('application/octet-stream');
  });

  test('rebuilds managed paths from the current document directory', () => {
    const entry = {
      filename: 'image.png',
      id: '00000000-0000-7000-8000-000000000001',
    } as Pick<FileEntry, 'filename' | 'id'>;
    testState.files.set(
      'file:///documents/Data/Files/00000000-0000-7000-8000-000000000001.png',
      10,
    );
    expect(getInternalFileUri(entry)).toBe(
      'file:///documents/Data/Files/00000000-0000-7000-8000-000000000001.png',
    );

    testState.paths.document.uri = 'file:///new-sandbox/Documents/';
    testState.files.set(
      'file:///new-sandbox/Documents/Data/Files/00000000-0000-7000-8000-000000000001.png',
      10,
    );
    expect(getInternalFileUri(entry)).toBe(
      'file:///new-sandbox/Documents/Data/Files/00000000-0000-7000-8000-000000000001.png',
    );
  });

  test('resolves persisted entries against the current document directory', async () => {
    const entries = createEntryStore();
    const entry = FileEntrySchema.parse({
      createdAt: 1,
      filename: 'image.png',
      id: '00000000-0000-7000-8000-000000000001',
      mediaType: 'image/png',
      provenance: 'imported',
      size: 10,
      updatedAt: 1,
    });
    entries.stored.set(entry.id, entry);
    testState.paths.document.uri = 'file:///new-sandbox/Documents/';
    const uri = 'file:///new-sandbox/Documents/Data/Files/00000000-0000-7000-8000-000000000001.png';
    testState.files.set(uri, 10);

    await expect(resolveFileEntry(entries, entry.id)).resolves.toEqual({ entry, uri });
    await expect(getFileUri(entries, entry.id)).resolves.toBe(uri);
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
      data: 'data:image/png;base64,AAAA',
      mediaType: 'image/png',
      provenance: 'generated',
      source: 'base64',
    });

    expect(entry).toEqual(
      expect.objectContaining({
        filename: 'painting-00000000-0000-7000-8000-000000000001.png',
        mediaType: 'image/png',
        provenance: 'generated',
        size: 4,
      }),
    );
    expect(testState.writes).toEqual([
      expect.objectContaining({ content: 'AAAA', options: { encoding: 'base64' } }),
    ]);
  });

  test('writes text verbatim under the caller-provided filename', async () => {
    const entries = createEntryStore();

    const entry = await createInternalEntry(entries, {
      data: '# Report\n',
      mediaType: 'text/markdown',
      name: 'report.md',
      provenance: 'generated',
      source: 'text',
    });

    expect(entry).toEqual(
      expect.objectContaining({
        filename: 'report.md',
        mediaType: 'text/markdown',
        provenance: 'generated',
        size: 9,
      }),
    );
    // No encoding option: expo-file-system writes UTF-8 by default.
    expect(testState.writes).toEqual([
      {
        content: '# Report\n',
        options: undefined,
        uri: 'file:///documents/Data/Files/00000000-0000-7000-8000-000000000001.md',
      },
    ]);
  });

  test('rejects a text filename that escapes the managed directory', async () => {
    await expect(
      createInternalEntry(createEntryStore(), {
        data: 'x',
        mediaType: 'text/plain',
        name: '../escape.txt',
        provenance: 'generated',
        source: 'text',
      }),
    ).rejects.toThrow();

    expect(testState.writes).toEqual([]);
  });

  test('removes a partially written text file on failure', async () => {
    const uri = 'file:///documents/Data/Files/00000000-0000-7000-8000-000000000001.txt';
    testState.writeFailures.add(uri);

    await expect(
      createInternalEntry(createEntryStore(), {
        data: 'x',
        mediaType: 'text/plain',
        name: 'notes.txt',
        provenance: 'generated',
        source: 'text',
      }),
    ).rejects.toThrow('write failed');
    expect(testState.files.has(uri)).toBe(false);
  });

  test('removes the text blob when FileEntry persistence fails', async () => {
    const entries = createEntryStore();
    entries.create.mockRejectedValueOnce(new Error('database failed'));

    await expect(
      createInternalEntry(entries, {
        data: 'x',
        mediaType: 'text/plain',
        name: 'notes.txt',
        provenance: 'generated',
        source: 'text',
      }),
    ).rejects.toThrow('database failed');

    expect(
      testState.files.has('file:///documents/Data/Files/00000000-0000-7000-8000-000000000001.txt'),
    ).toBe(false);
  });

  test('removes a partially written generated image on failure', async () => {
    const uri = 'file:///documents/Data/Files/00000000-0000-7000-8000-000000000001.png';
    testState.writeFailures.add(uri);

    await expect(
      createInternalEntry(createEntryStore(), {
        data: 'AAAA',
        mediaType: 'image/png',
        provenance: 'generated',
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
        name: 'brief.txt',
        provenance: 'imported',
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
      name: 'brief.txt',
      provenance: 'imported',
      source: 'uri',
      uri: 'file:///picker/brief.txt',
    });
    entries.delete.mockRejectedValueOnce(new Error('database failed'));

    await discardInternalEntries(entries, [entry]);

    expect(
      testState.files.has('file:///documents/Data/Files/00000000-0000-7000-8000-000000000001.txt'),
    ).toBe(true);
  });

  test('hard-deletes an entry row and its file', async () => {
    const entry = internalEntry();
    const uri = `file:///documents/Data/Files/${entry.id}.txt`;
    testState.files.set(uri, entry.size);
    const tx = {};
    const entries = {
      deleteTx: jest.fn(async () => undefined),
      findByIdTx: jest.fn(async () => entry),
      withWriteTx: jest.fn(async (callback: (value: unknown) => Promise<unknown>) => callback(tx)),
    };

    await expect(deleteInternalEntry(entries as never, entry.id)).resolves.toBe(true);

    expect(entries.deleteTx).toHaveBeenCalledWith(tx, entry.id);
    expect(testState.files.has(uri)).toBe(false);
  });

  test('reports a missing entry row without deleting anything', async () => {
    const entry = internalEntry();
    const entries = {
      deleteTx: jest.fn(async () => undefined),
      findByIdTx: jest.fn(async () => null),
      withWriteTx: jest.fn(async (callback: (value: unknown) => Promise<unknown>) => callback({})),
    };

    await expect(deleteInternalEntry(entries as never, entry.id)).resolves.toBe(false);
    expect(entries.deleteTx).not.toHaveBeenCalled();
  });

  test('resolves a local image as a data URL, falling back to the file type', async () => {
    await expect(imageUriToDataUrl('file:///picker/photo.jpg', 'unknown')).resolves.toBe(
      'data:image/jpeg;base64,encoded',
    );
  });

  test('reads local file bytes without projecting a path into the result', async () => {
    await expect(readFileUriBytes('file:///documents/Data/Files/file.txt')).resolves.toEqual(
      Uint8Array.from([116, 101, 120, 116]),
    );
  });

  test('deletes only an existing managed blob', () => {
    const uri = 'file:///documents/Data/Files/00000000-0000-7000-8000-000000000001.png';
    testState.files.set(uri, 1);
    const entry = {
      filename: 'image.png',
      id: '00000000-0000-7000-8000-000000000001',
    } as Pick<FileEntry, 'filename' | 'id'>;

    expect(deleteInternalFile(entry)).toBe(true);
    expect(testState.files.has(uri)).toBe(false);
    expect(deleteInternalFile(entry)).toBe(false);
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

function internalEntry(): FileEntry {
  return FileEntrySchema.parse({
    createdAt: 1,
    filename: 'notes.txt',
    id: '00000000-0000-7000-8000-000000000001',
    mediaType: 'text/plain',
    provenance: 'imported',
    size: 12,
    updatedAt: 1,
  });
}
