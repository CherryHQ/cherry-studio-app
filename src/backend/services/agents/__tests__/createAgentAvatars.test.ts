import type { AvatarResources } from '@/backend/services/avatars/avatarResources';
import type { UserContentImageStorage } from '@/backend/services/file/userContentImageStorage';
import type { Agent } from '@/shared/data/types/agent';

import { createAgentAvatars } from '../createAgentAvatars';

const id = '00000000-0000-4000-8000-000000000001';
const previous = 'avatar-resource:00000000-0000-4000-8000-000000000002';
const next = 'avatar-resource:00000000-0000-4000-8000-000000000003';
const draft = 'avatar-draft:00000000-0000-4000-8000-000000000004';

function setup(avatar = previous) {
  let current = { id, avatar, avatarUri: null } as Agent;
  const order: string[] = [];
  const agents = {
    getById: jest.fn(async () => current),
    setAvatar: jest.fn(async (_id: string, reference: string) => {
      order.push('commit');
      current = { ...current, avatar: reference };
      return current;
    }),
  };
  const resources = {
    createDraft: jest.fn(),
    persist: jest.fn(async () => {
      order.push('create');
      return next;
    }),
    remove: jest.fn(async () => {
      order.push('remove');
    }),
    resolve: jest.fn(async () => ({
      recipe: {
        character: '00000000-0000-4000-8000-0000000000aa',
        look: 'default',
        background: '#ffe1de',
      },
      coverUri: 'file:///covers/current.png',
    })),
  } satisfies AvatarResources;
  const images = {
    create: jest.fn(async () => 'photo.webp'),
    remove: jest.fn(async () => true),
    resolve: jest.fn(async () => 'file:///covers/photo.webp'),
  } satisfies UserContentImageStorage;
  return {
    api: createAgentAvatars({ agents, resources, images }),
    agents,
    resources,
    images,
    order,
  };
}

test('commits only the resource reference before deleting the previous avatar', async () => {
  const { api, agents, resources, order } = setup();
  const updated = await api.setAvatar(id, { sourceUri: draft });
  expect(agents.setAvatar).toHaveBeenCalledWith(id, next);
  expect(updated).toMatchObject({ avatar: next, avatarUri: 'file:///covers/current.png' });
  expect(resources.remove).toHaveBeenCalledWith(previous);
  expect(order).toEqual(['create', 'commit', 'remove']);
});

test('a failed commit removes only the newly copied resource', async () => {
  const { api, agents, resources } = setup();
  agents.setAvatar.mockRejectedValueOnce(new Error('Write failed'));
  await expect(api.setAvatar(id, { sourceUri: draft })).rejects.toThrow('Write failed');
  expect(resources.remove.mock.calls).toEqual([[next]]);
});

test('switching to a photo removes the old dynamic resource after the image is committed', async () => {
  const { api, resources, agents } = setup();
  const updated = await api.setAvatar(id, { sourceUri: 'file:///picker/photo.jpg' });
  expect(agents.setAvatar).toHaveBeenCalledWith(id, 'agent-avatar-file:photo.webp');
  expect(resources.remove).toHaveBeenCalledWith(previous);
  expect(resources.persist).not.toHaveBeenCalled();
  expect(updated.avatarUri).toBe('file:///covers/photo.webp');
});

test('switching from a photo removes the previous image and tolerates cleanup failure', async () => {
  const { api, images } = setup('agent-avatar-file:old.webp');
  images.remove.mockRejectedValueOnce(new Error('Cleanup failed'));
  await expect(api.setAvatar(id, { sourceUri: draft })).resolves.toMatchObject({ avatar: next });
  expect(images.remove).toHaveBeenCalledWith('old.webp');
});
