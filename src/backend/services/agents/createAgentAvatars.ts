import type { AgentService } from '@/backend/data/services/AgentService';
import type { AvatarResources } from '@/backend/services/avatars/avatarResources';
import type { UserContentImageStorage } from '@/backend/services/file/userContentImageStorage';
import { loggerService } from '@/shared/core/logger/LoggerService';
import type { SetAgentAvatarDto } from '@/shared/data/api/schemas/agents';
import type { Agent } from '@/shared/data/types/agent';
import { isAvatarSource } from '@/shared/data/types/avatar';

import { replaceAgentAvatar, resolveAgentAvatarUri } from './agentAvatarStorage';

type AgentAvatarData = Pick<AgentService, 'getById' | 'setAvatar'>;
const logger = loggerService.withContext('AgentAvatars');

export type AgentAvatars = {
  setAvatar(id: string, input: SetAgentAvatarDto): Promise<Agent>;
  withUri(agent: Agent): Promise<Agent>;
  withUris(agents: readonly Agent[]): Promise<Agent[]>;
};

/** Owns create-resource → commit-reference → remove-previous, for images and dynamic avatars. */
export function createAgentAvatars(dependencies: {
  agents: AgentAvatarData;
  images: UserContentImageStorage;
  resources: AvatarResources;
}): AgentAvatars {
  const { agents, images, resources } = dependencies;
  const withUri = async (agent: Agent): Promise<Agent> => ({
    ...agent,
    avatarUri: isAvatarSource(agent.avatar)
      ? ((await resources.resolve(agent.avatar))?.coverUri ?? null)
      : ((await resolveAgentAvatarUri(images, agent.avatar)) ?? null),
  });
  const removeResource = async (reference: string) => {
    try {
      await resources.remove(reference);
    } catch (error) {
      logger.warn('Failed to remove an unused avatar resource', error as Error, { reference });
    }
  };

  return {
    async setAvatar(id, input) {
      const current = await agents.getById(id);
      let updated: Agent;
      if (isAvatarSource(input.sourceUri)) {
        const reference = await resources.persist(input.sourceUri);
        try {
          updated = await agents.setAvatar(id, reference);
        } catch (error) {
          await removeResource(reference);
          throw error;
        }
        if (current.avatar?.startsWith('agent-avatar-file:')) {
          try {
            await images.remove(current.avatar.slice('agent-avatar-file:'.length));
          } catch (error) {
            logger.warn('Failed to remove the replaced avatar image', error as Error, { id });
          }
        }
      } else {
        updated = await replaceAgentAvatar(images, id, input.sourceUri, current.avatar, (avatar) =>
          agents.setAvatar(id, avatar),
        );
      }
      if (isAvatarSource(current.avatar)) await removeResource(current.avatar);
      return withUri(updated);
    },
    withUri,
    withUris(list) {
      return Promise.all(list.map(withUri));
    },
  };
}
