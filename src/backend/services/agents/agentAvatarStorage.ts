import { loggerService } from '@logger';

import {
  createUserContentImageStorage,
  STORED_NAME_UUID_FRAGMENT,
  type UserContentImageStorage,
  type UserContentImageStorageConfig,
} from '@/backend/services/file/userContentImageStorage';

const logger = loggerService.withContext('AgentAvatarStorage');
/**
 * Column-value prefix for a managed avatar image, matching the user-avatar
 * convention: deliberately not `file:`, which collides with the `file://` URL
 * scheme. The column never holds an absolute path — iOS relocates the app
 * container between launches, so a stored absolute path stops resolving.
 */
const STORED_AVATAR_PREFIX = 'agent-avatar-file:';

/**
 * One file per Agent, so the stored name carries the owner: `{agentId}.{uuid}.webp`.
 * The uuid rotates on every replace because the uri doubles as the image cache
 * key — reusing the path would keep the previous photo on screen.
 */
export const AGENT_AVATAR_IMAGE_CONFIG: UserContentImageStorageConfig = {
  directoryName: 'agent-avatars',
  storedNamePattern: new RegExp(
    `^${STORED_NAME_UUID_FRAGMENT}\\.${STORED_NAME_UUID_FRAGMENT}\\.webp$`,
    'i',
  ),
};

/** Production instance. Tests inject their own storage into the functions below. */
export const agentAvatarImages = createUserContentImageStorage(AGENT_AVATAR_IMAGE_CONFIG);

function storedAvatarName(avatar: string): string | undefined {
  return avatar.startsWith(STORED_AVATAR_PREFIX)
    ? avatar.slice(STORED_AVATAR_PREFIX.length)
    : undefined;
}

/**
 * Resolve the column value into an image URI for this device, rebuilding the
 * absolute path per call. Unlike the user avatar there is no direct-URI escape
 * hatch: this column is only ever written by {@link replaceAgentAvatar}.
 */
export async function resolveAgentAvatarUri(
  images: UserContentImageStorage,
  avatar: null | string,
): Promise<string | undefined> {
  const storedName = avatar ? storedAvatarName(avatar) : undefined;

  return storedName ? images.resolve(storedName) : undefined;
}

/**
 * Create the new managed image before switching the column. A column write
 * failure compensates the new file, so a failed replace leaves neither an
 * orphan nor a dangling reference; the previous file is removed only once the
 * new reference is durable.
 *
 * Returns whatever `persistAvatar` returned, which is how a caller gets the
 * updated record without having to re-read it — and without a nullable local
 * that only the control flow proves is set.
 */
export async function replaceAgentAvatar<TPersisted>(
  images: UserContentImageStorage,
  agentId: string,
  sourceUri: string,
  previousAvatar: null | string,
  persistAvatar: (avatar: string) => Promise<TPersisted>,
): Promise<TPersisted> {
  const nextName = await images.create(sourceUri, agentId);
  let persisted: TPersisted;

  try {
    persisted = await persistAvatar(`${STORED_AVATAR_PREFIX}${nextName}`);
  } catch (error) {
    try {
      await images.remove(nextName);
    } catch (cleanupError) {
      logger.error(
        'Failed to delete a new agent avatar after the column write failed',
        cleanupError as Error,
        { agentId, storedName: nextName },
      );
    }
    throw error;
  }

  const previousName = previousAvatar ? storedAvatarName(previousAvatar) : undefined;

  if (previousName) {
    try {
      await images.remove(previousName);
    } catch (error) {
      logger.warn('Failed to delete the replaced agent avatar', error as Error, {
        agentId,
        storedName: previousName,
      });
    }
  }

  return persisted;
}
