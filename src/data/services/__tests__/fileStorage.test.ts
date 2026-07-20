import type { CherryMessagePart } from '@/data/types/message';
import { readCherryMeta } from '@/data/types/uiParts';

import { prepareMessageParts, resolveInternalFileUri } from '../fileStorage';

jest.mock('uuid', () => ({
  v7: jest.fn(() => '00000000-0000-7000-8000-000000000001'),
}));

jest.mock('expo-file-system', () => {
  const directories = new Set<string>();
  const files = new Map<string, number>();
  const copies: { destination: string; source: string }[] = [];
  const failures = new Set<string>();
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
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: paths,
    testState: { copies, directories, failures, files, paths },
  };
});

type FileSystemTestState = {
  copies: { destination: string; source: string }[];
  directories: Set<string>;
  failures: Set<string>;
  files: Map<string, number>;
  paths: { document: { uri: string } };
};

const { testState } = jest.requireMock<{ testState: FileSystemTestState }>('expo-file-system');

describe('fileStorage', () => {
  beforeEach(() => {
    testState.copies.length = 0;
    testState.directories.clear();
    testState.failures.clear();
    testState.files.clear();
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
        uri: 'file:///documents/files/00000000-0000-7000-8000-000000000001.pdf',
      },
    ]);
    expect(prepared.parts[0]).toEqual(
      expect.objectContaining({
        url: 'file:///documents/files/00000000-0000-7000-8000-000000000001.pdf',
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
        uri: 'file:///documents/files/00000000-0000-7000-8000-000000000001',
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
    testState.files.set('file:///documents/files/00000000-0000-7000-8000-000000000001.png', 10);
    expect(resolveInternalFileUri(entry)).toBe(
      'file:///documents/files/00000000-0000-7000-8000-000000000001.png',
    );

    testState.paths.document.uri = 'file:///new-sandbox/Documents/';
    testState.files.set(
      'file:///new-sandbox/Documents/files/00000000-0000-7000-8000-000000000001.png',
      10,
    );
    expect(resolveInternalFileUri(entry)).toBe(
      'file:///new-sandbox/Documents/files/00000000-0000-7000-8000-000000000001.png',
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
});

function createFilePart(url: string, filename: string): CherryMessagePart {
  return {
    filename,
    mediaType: 'application/octet-stream',
    type: 'file',
    url,
  };
}
