import type { UserContentImageStorage } from '@/backend/services/file/userContentImageStorage';

import { replaceAgentAvatar, resolveAgentAvatarUri } from '../agentAvatarStorage';

const AGENT_ID = '00000000-0000-4000-8000-000000000001';
const STORED_NAME = `${AGENT_ID}.11111111-1111-4111-8111-111111111111.webp`;
const PREVIOUS_NAME = `${AGENT_ID}.22222222-2222-4222-8222-222222222222.webp`;
const PREVIOUS_REFERENCE = `agent-avatar-file:${PREVIOUS_NAME}`;
const sourceUri = 'file:///picker/avatar.jpg';

function createImages(overrides: Partial<UserContentImageStorage> = {}) {
  const images: UserContentImageStorage = {
    create: jest.fn(async () => STORED_NAME),
    remove: jest.fn(async () => true),
    resolve: jest.fn(async (name: string) => `file:///documents/agent-avatars/${name}`),
    ...overrides,
  };

  return images as {
    [TKey in keyof UserContentImageStorage]: jest.Mock;
  } & UserContentImageStorage;
}

describe('replaceAgentAvatar', () => {
  it('stores the new image, writes the column, then drops the previous file', async () => {
    const images = createImages();
    const order: string[] = [];
    images.create.mockImplementation(async () => {
      order.push('create');
      return STORED_NAME;
    });
    images.remove.mockImplementation(async () => {
      order.push('remove');
      return true;
    });

    const persisted = await replaceAgentAvatar(
      images,
      AGENT_ID,
      sourceUri,
      PREVIOUS_REFERENCE,
      async (avatar) => {
        order.push('persist');
        return { avatar };
      },
    );

    expect(images.create).toHaveBeenCalledWith(sourceUri, AGENT_ID);
    // The agent id is part of the file name so an orphan traces back to its owner.
    expect(persisted).toEqual({ avatar: `agent-avatar-file:${STORED_NAME}` });
    expect(images.remove).toHaveBeenCalledWith(PREVIOUS_NAME);
    expect(order).toEqual(['create', 'persist', 'remove']);
  });

  it('deletes the new file when the column write fails, leaving no orphan', async () => {
    const images = createImages();
    const writeFailure = new Error('column write failed');

    await expect(
      replaceAgentAvatar(images, AGENT_ID, sourceUri, PREVIOUS_REFERENCE, async () => {
        throw writeFailure;
      }),
    ).rejects.toBe(writeFailure);

    // Only the new file: the previous one is still what the column points at.
    expect(images.remove).toHaveBeenCalledTimes(1);
    expect(images.remove).toHaveBeenCalledWith(STORED_NAME);
  });

  it('keeps the successful replace when deleting the previous file fails', async () => {
    const images = createImages({
      remove: jest.fn(async () => {
        throw new Error('previous file is gone');
      }),
    });

    // A leftover file is a wasted 2 MB; failing here would instead throw away a
    // replace the column has already committed.
    await expect(
      replaceAgentAvatar(images, AGENT_ID, sourceUri, PREVIOUS_REFERENCE, async (avatar) => avatar),
    ).resolves.toBe(`agent-avatar-file:${STORED_NAME}`);
  });

  it('has nothing to drop for an agent that had no avatar', async () => {
    const images = createImages();

    await replaceAgentAvatar(images, AGENT_ID, sourceUri, null, async (avatar) => avatar);

    expect(images.remove).not.toHaveBeenCalled();
  });
});

describe('resolveAgentAvatarUri', () => {
  it('rebuilds the uri from the stored name', async () => {
    const images = createImages();

    await expect(resolveAgentAvatarUri(images, PREVIOUS_REFERENCE)).resolves.toBe(
      `file:///documents/agent-avatars/${PREVIOUS_NAME}`,
    );
  });

  it.each([null, '', 'file:///documents/agent-avatars/escape.webp'])(
    'resolves nothing for %p',
    async (avatar) => {
      const images = createImages();

      await expect(resolveAgentAvatarUri(images, avatar)).resolves.toBeUndefined();
      expect(images.resolve).not.toHaveBeenCalled();
    },
  );
});
