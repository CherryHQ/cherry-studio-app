import { type FileEntryId, FileEntryIdSchema } from '@cherrystudio/universal/data/types/file';

import type { UserContentImageStorage } from '@/backend/services/file/userContentImageStorage';

import { replaceUserAvatar, resolveUserAvatarUri } from '../userAvatarStorage';

jest.mock('expo-file-system', () => {
  const files = new Set<string>();
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
  }

  class MockFile {
    readonly uri: string;

    constructor(...parts: (string | { uri: string })[]) {
      this.uri = joinUri(parts, false);
    }

    get exists() {
      return files.has(this.uri);
    }

    delete() {
      files.delete(this.uri);
    }
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: { document: { uri: 'file:///documents/' } },
    testState: { files },
  };
});

const fileIds = [
  FileEntryIdSchema.parse('00000000-0000-4000-8000-000000000001'),
  FileEntryIdSchema.parse('00000000-0000-4000-8000-000000000002'),
];

const { testState } = jest.requireMock<{ testState: { files: Set<string> } }>('expo-file-system');

describe('userAvatarStorage', () => {
  beforeEach(() => {
    testState.files.clear();
  });

  it('stores a picked image behind a managed file reference', async () => {
    const images = createImageStorage();
    let avatar = '';

    await replaceUserAvatar(images, 'file:///picker/avatar.jpg', '', async (nextAvatar) => {
      avatar = nextAvatar;
    });

    expect(avatar).toBe(`file:${fileIds[0]}`);
    expect(images.create).toHaveBeenCalledWith('file:///picker/avatar.jpg');
    await expect(resolveUserAvatarUri(images, avatar)).resolves.toBe(
      `file:///managed/${fileIds[0]}.webp`,
    );
  });

  it('deletes the previous managed file only after persisting its replacement', async () => {
    const images = createImageStorage();
    let previousAvatar = '';
    await replaceUserAvatar(images, 'file:///picker/first.jpg', '', async (nextAvatar) => {
      previousAvatar = nextAvatar;
    });

    let nextAvatar = '';
    await replaceUserAvatar(images, 'file:///picker/second.jpg', previousAvatar, async (value) => {
      nextAvatar = value;
      await expect(resolveUserAvatarUri(images, previousAvatar)).resolves.toBeDefined();
    });

    await expect(resolveUserAvatarUri(images, previousAvatar)).resolves.toBeUndefined();
    await expect(resolveUserAvatarUri(images, nextAvatar)).resolves.toBeDefined();
  });

  it('compensates the new file and preserves the previous avatar when persistence fails', async () => {
    const images = createImageStorage();
    let previousAvatar = '';
    await replaceUserAvatar(images, 'file:///picker/first.jpg', '', async (nextAvatar) => {
      previousAvatar = nextAvatar;
    });

    let rejectedAvatar = '';
    await expect(
      replaceUserAvatar(images, 'file:///picker/second.jpg', previousAvatar, async (nextAvatar) => {
        rejectedAvatar = nextAvatar;
        throw new Error('preference write failed');
      }),
    ).rejects.toThrow('preference write failed');

    await expect(resolveUserAvatarUri(images, previousAvatar)).resolves.toBeDefined();
    await expect(resolveUserAvatarUri(images, rejectedAvatar)).resolves.toBeUndefined();
  });

  it('keeps legacy references readable until their separate cleanup', async () => {
    const images = createImageStorage();
    const legacyRef = `file:${fileIds[0]}`;
    testState.files.add(`file:///documents/user-avatars/${fileIds[0]}`);

    await expect(resolveUserAvatarUri(images, legacyRef)).resolves.toBe(
      `file:///documents/user-avatars/${fileIds[0]}`,
    );
    await expect(resolveUserAvatarUri(images, 'https://example.com/avatar.png')).resolves.toBe(
      'https://example.com/avatar.png',
    );
    await expect(resolveUserAvatarUri(images, 'data:image/png;base64,abc')).resolves.toBe(
      'data:image/png;base64,abc',
    );
    await expect(resolveUserAvatarUri(images, 'file:///legacy/avatar.png')).resolves.toBe(
      'file:///legacy/avatar.png',
    );
    await expect(resolveUserAvatarUri(images, '😀')).resolves.toBeUndefined();
  });
});

function createImageStorage(): UserContentImageStorage {
  const uris = new Map<FileEntryId, string>();
  let nextId = 0;

  return {
    create: jest.fn(async () => {
      const id = fileIds[nextId++];
      if (!id) {
        throw new Error('No test FileEntry id available');
      }
      uris.set(id, `file:///managed/${id}.webp`);
      return id;
    }),
    remove: jest.fn(async (id) => uris.delete(id)),
    resolve: jest.fn(async (id) => uris.get(id)),
  };
}
