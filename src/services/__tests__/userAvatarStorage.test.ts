import { replaceUserAvatar, resolveUserAvatarUri } from '../userAvatarStorage';

jest.mock('expo-file-system', () => {
  const directories = new Set<string>();
  const files = new Set<string>();
  const copies: { destination: string; source: string }[] = [];
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

    async copy(destination: MockFile) {
      copies.push({ destination: destination.uri, source: this.uri });
      files.add(destination.uri);
    }

    delete() {
      files.delete(this.uri);
    }
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: { document: { uri: 'file:///documents/' } },
    testState: { copies, directories, files },
  };
});

type FileSystemTestState = {
  copies: { destination: string; source: string }[];
  directories: Set<string>;
  files: Set<string>;
};

const { testState } = jest.requireMock<{ testState: FileSystemTestState }>('expo-file-system');

describe('userAvatarStorage', () => {
  beforeEach(() => {
    testState.copies.length = 0;
    testState.directories.clear();
    testState.files.clear();
  });

  it('stores a picked image behind a path-resilient file reference', async () => {
    let avatar = '';

    await replaceUserAvatar('file:///picker/avatar.jpg', '', async (nextAvatar) => {
      avatar = nextAvatar;
    });

    expect(avatar).toMatch(
      /^file:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(testState.copies).toEqual([
      {
        destination: `file:///documents/user-avatars/${avatar.slice('file:'.length)}`,
        source: 'file:///picker/avatar.jpg',
      },
    ]);
    expect(resolveUserAvatarUri(avatar)).toBe(
      `file:///documents/user-avatars/${avatar.slice('file:'.length)}`,
    );
  });

  it('deletes the previous managed file only after persisting its replacement', async () => {
    let previousAvatar = '';
    await replaceUserAvatar('file:///picker/first.jpg', '', async (nextAvatar) => {
      previousAvatar = nextAvatar;
    });

    let nextAvatar = '';
    await replaceUserAvatar('file:///picker/second.jpg', previousAvatar, async (value) => {
      nextAvatar = value;
      expect(resolveUserAvatarUri(previousAvatar)).toBeDefined();
    });

    expect(resolveUserAvatarUri(previousAvatar)).toBeUndefined();
    expect(resolveUserAvatarUri(nextAvatar)).toBeDefined();
  });

  it('compensates the new file and preserves the previous avatar when persistence fails', async () => {
    let previousAvatar = '';
    await replaceUserAvatar('file:///picker/first.jpg', '', async (nextAvatar) => {
      previousAvatar = nextAvatar;
    });

    let rejectedAvatar = '';
    await expect(
      replaceUserAvatar('file:///picker/second.jpg', previousAvatar, async (nextAvatar) => {
        rejectedAvatar = nextAvatar;
        throw new Error('preference write failed');
      }),
    ).rejects.toThrow('preference write failed');

    expect(resolveUserAvatarUri(previousAvatar)).toBeDefined();
    expect(resolveUserAvatarUri(rejectedAvatar)).toBeUndefined();
  });

  it('keeps legacy image URIs and rejects non-image or unresolved values', () => {
    expect(resolveUserAvatarUri('https://example.com/avatar.png')).toBe(
      'https://example.com/avatar.png',
    );
    expect(resolveUserAvatarUri('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
    expect(resolveUserAvatarUri('file:///legacy/avatar.png')).toBe('file:///legacy/avatar.png');
    expect(resolveUserAvatarUri('😀')).toBeUndefined();
    expect(resolveUserAvatarUri('file:00000000-0000-4000-8000-000000000000')).toBeUndefined();
  });
});
