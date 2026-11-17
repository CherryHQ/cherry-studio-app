import { DataApiErrorFactory } from '@/shared/data/api/errors';
import type { Agent } from '@/shared/data/types/agent';

import { createAgentAvatars } from '../createAgentAvatars';

const current = {
  id: 'agent',
  avatar: 'agent-avatar-file:previous.webp',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as Agent;

function fixture() {
  const images = {
    create: jest.fn(async () => 'next.webp'),
    remove: jest.fn(async () => true),
    resolve: jest.fn(async () => 'file:///avatar.webp'),
  };
  const agents = { getById: jest.fn(async () => current), setAvatar: jest.fn(async () => current) };
  return { images, agents, avatars: createAgentAvatars({ agents, images }) };
}

it('rejects a known stale version before creating an avatar image', async () => {
  const f = fixture();
  await expect(
    f.avatars.setAvatar(
      'agent',
      { sourceUri: 'file:///source.png' },
      { expectedUpdatedAt: '2025-01-01T00:00:00.000Z' },
    ),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(f.images.create).not.toHaveBeenCalled();
  expect(f.agents.setAvatar).not.toHaveBeenCalled();
});

it('compensates a new image if another edit wins while it is being normalized', async () => {
  const f = fixture();
  f.agents.setAvatar.mockRejectedValue(DataApiErrorFactory.conflict('changed'));
  await expect(
    f.avatars.setAvatar(
      'agent',
      { sourceUri: 'file:///source.png' },
      { expectedUpdatedAt: current.updatedAt },
    ),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(f.agents.setAvatar).toHaveBeenCalledWith('agent', 'agent-avatar-file:next.webp', {
    expectedUpdatedAt: current.updatedAt,
  });
  expect(f.images.remove).toHaveBeenCalledTimes(1);
  expect(f.images.remove).toHaveBeenCalledWith('next.webp');
});
