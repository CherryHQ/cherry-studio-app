import type { UserContentImageStorage } from '@/backend/services/file/userContentImageStorage';

import { replaceUserAvatar, resolveUserAvatarUri } from '../userAvatarStorage';

const storedNames = [
  '00000000-0000-4000-8000-000000000001.webp',
  '00000000-0000-4000-8000-000000000002.webp',
];

describe('userAvatarStorage', () => {
  it('stores a picked image behind a managed avatar-file reference', async () => {
    const images = createImageStorage();
    let avatar = '';

    await replaceUserAvatar(images, 'file:///picker/avatar.jpg', '', async (nextAvatar) => {
      avatar = nextAvatar;
    });

    expect(avatar).toBe(`avatar-file:${storedNames[0]}`);
    expect(images.create).toHaveBeenCalledWith('file:///picker/avatar.jpg');
    await expect(resolveUserAvatarUri(images, avatar)).resolves.toBe(
      `file:///managed/${storedNames[0]}`,
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

  it('passes direct image URIs through and rejects everything else', async () => {
    const images = createImageStorage();

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
    expect(images.resolve).not.toHaveBeenCalled();
  });
});

function createImageStorage(): UserContentImageStorage {
  const uris = new Map<string, string>();
  let nextIndex = 0;

  return {
    create: jest.fn(async () => {
      const storedName = storedNames[nextIndex++];
      if (!storedName) {
        throw new Error('No test stored name available');
      }
      uris.set(storedName, `file:///managed/${storedName}`);
      return storedName;
    }),
    remove: jest.fn(async (storedName) => uris.delete(storedName)),
    resolve: jest.fn(async (storedName) => uris.get(storedName)),
  };
}
