import type { AgentService } from '@/backend/data/services/AgentService';
import type { UserContentImageStorage } from '@/backend/services/file/userContentImageStorage';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import type { SetAgentAvatarDto } from '@/shared/data/api/schemas/agents';
import type { Agent } from '@/shared/data/types/agent';

import { replaceAgentAvatar, resolveAgentAvatarUri } from './agentAvatarStorage';

type AgentAvatarData = Pick<AgentService, 'getById' | 'setAvatar'>;

export type AgentAvatars = {
  setAvatar(
    id: string,
    input: SetAgentAvatarDto,
    options?: { expectedUpdatedAt?: string },
  ): Promise<Agent>;
  withUri(agent: Agent): Promise<Agent>;
  withUris(agents: readonly Agent[]): Promise<Agent[]>;
};

/**
 * Owns uploaded avatar files and their read-time URI projection, which require
 * a directory `backend/data` must not reach into. Built-in emoji pass through
 * unchanged with no image URI.
 *
 * Writes go create-file → write-column → drop-previous-file, so a failure never
 * leaves an orphaned image or a column pointing at nothing. Reads project the
 * column into a device-local uri, which is rebuilt every time rather than
 * stored — iOS relocates the app container between launches.
 */
export function createAgentAvatars(dependencies: {
  agents: AgentAvatarData;
  images: UserContentImageStorage;
}): AgentAvatars {
  const { agents, images } = dependencies;
  const withUri = async (agent: Agent): Promise<Agent> => ({
    ...agent,
    avatarUri: (await resolveAgentAvatarUri(images, agent.avatar)) ?? null,
  });

  return {
    async setAvatar(id, input, options = {}) {
      // Read first: a missing agent fails before anything reaches disk, and the
      // replace needs to know which file it supersedes.
      const current = await agents.getById(id);
      if (
        options.expectedUpdatedAt !== undefined &&
        current.updatedAt !== options.expectedUpdatedAt
      )
        throw DataApiErrorFactory.conflict(
          'The Agent changed. Read it again before changing its avatar.',
        );
      const updated = await replaceAgentAvatar(
        images,
        id,
        input.sourceUri,
        current.avatar,
        (avatar) => agents.setAvatar(id, avatar, options),
      );

      return withUri(updated);
    },

    withUri,

    // Resolved per agent rather than batched: this is a file-existence check,
    // not a query, so there is nothing to amortize across rows.
    withUris(list) {
      return Promise.all(list.map(withUri));
    },
  };
}
