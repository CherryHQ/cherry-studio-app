import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';
import { readCherryMeta } from '@cherrystudio/universal/data/types/uiParts';

import {
  deleteInternalFile,
  deleteInternalFileUri,
  imageUriToDataUrl,
  listInternalFiles,
  prepareGeneratedImage,
  prepareMessageParts,
  resolveInternalFileUri,
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

    const prepared = await prepareMessageParts([
      createFilePart('file:///picker/brief.PDF', 'Quarterly Brief.PDF'),
    ]);

    expect(prepared.files).toEqual([
      {
        ext: 'pdf',
        id: '00000000-0000-7000-8000-000000000001',
        name: 'Quarterly Brief',
        size: 42,
        uri: 'file:///documents/Data/Files/00000000-0000-7000-8000-000000000001.pdf',
      },
    ]);
    expect(prepared.parts[0]).toEqual(
      expect.objectContaining({
        url: 'file:///documents/Data/Files/00000000-0000-7000-8000-000000000001.pdf',
      }),
    );
    const preparedPart = prepared.parts[0];
    expect(preparedPart.type).toBe('file');
    if (preparedPart.type !== 'file') {
      throw new Error('Expected a prepared file part');
    }
    expect(readCherryMeta(preparedPart)?.fileEntryId).toBe('00000000-0000-7000-8000-000000000001');
  });

  test('stores extensionless files without a trailing dot', async () => {
    testState.files.set('file:///picker/README', 7);

    const prepared = await prepareMessageParts([createFilePart('file:///picker/README', 'README')]);

    expect(prepared.files[0]).toEqual(
      expect.objectContaining({
        ext: null,
        name: 'README',
        uri: 'file:///documents/Data/Files/00000000-0000-7000-8000-000000000001',
      }),
    );
  });

  test('uses the source extension when a camera display name has none', async () => {
    testState.files.set('file:///camera/IMG_0001.JPG', 128);

    const prepared = await prepareMessageParts([
      createFilePart('file:///camera/IMG_0001.JPG', 'Photo'),
    ]);

    expect(prepared.files[0]).toEqual(expect.objectContaining({ ext: 'jpg', name: 'Photo' }));
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

  test('removes every copied destination when a later copy fails partially', async () => {
    testState.files.set('file:///picker/first.txt', 1);
    testState.files.set('file:///picker/second.txt', 2);
    testState.failures.add('file:///picker/second.txt');

    await expect(
      prepareMessageParts([
        createFilePart('file:///picker/first.txt', 'first.txt'),
        createFilePart('file:///picker/second.txt', 'second.txt'),
      ]),
    ).rejects.toThrow('copy failed');

    expect([...testState.files.keys()]).toEqual([
      'file:///picker/first.txt',
      'file:///picker/second.txt',
    ]);
  });

  test('writes generated base64 into a managed image file', () => {
    const prepared = prepareGeneratedImage('data:image/png;base64,AAAA', 'image/png');

    expect(prepared).toEqual(
      expect.objectContaining({
        ext: 'png',
        size: 4,
        uri: 'file:///documents/Data/Files/00000000-0000-7000-8000-000000000001.png',
      }),
    );
    expect(testState.writes).toEqual([
      expect.objectContaining({ content: 'AAAA', options: { encoding: 'base64' } }),
    ]);
  });

  test('removes a partially written generated image on failure', () => {
    const uri = 'file:///documents/Data/Files/00000000-0000-7000-8000-000000000001.png';
    testState.writeFailures.add(uri);

    expect(() => prepareGeneratedImage('AAAA', 'image/png')).toThrow('write failed');
    expect(testState.files.has(uri)).toBe(false);
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

function createFilePart(url: string, filename: string): CherryMessagePart {
  return {
    filename,
    mediaType: 'application/octet-stream',
    type: 'file',
    url,
  };
}
