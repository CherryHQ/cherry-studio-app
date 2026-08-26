import { loggerService } from '@logger';

import {
  STORED_NAME_UUID_FRAGMENT,
  type UserContentImageStorage,
  type UserContentImageStorageConfig,
} from '@/backend/services/file/userContentImageStorage';

const logger = loggerService.withContext('UserAvatarStorage');
/**
 * Preference-value prefix for a managed avatar image. Deliberately not `file:`
 * — that prefix is a URL-scheme collision with `file://` URIs, which the
 * previous format had to disambiguate by hand.
 */
const STORED_AVATAR_PREFIX = 'avatar-file:';
const DIRECT_IMAGE_URI_PATTERN = /^(?:blob:|content:\/\/|data:image\/|file:\/\/|https?:\/\/)/i;

/** One owner, so the stored name is the bare uuid: `{uuid}.webp`. */
export const USER_AVATAR_IMAGE_CONFIG: UserContentImageStorageConfig = {
  directoryName: 'user-avatar',
  storedNamePattern: new RegExp(`^${STORED_NAME_UUID_FRAGMENT}\\.webp$`, 'i'),
};

type PersistAvatar = (avatar: string) => Promise<void>;

function storedAvatarName(avatar: string): string | undefined {
  return avatar.startsWith(STORED_AVATAR_PREFIX)
    ? avatar.slice(STORED_AVATAR_PREFIX.length)
    : undefined;
}

async function deleteStoredAvatar(images: UserContentImageStorage, avatar: string): Promise<void> {
  const storedName = storedAvatarName(avatar);

  if (!storedName) {
    return;
  }

  try {
    await images.remove(storedName);
  } catch (error) {
    logger.warn('Failed to delete stored user avatar', error as Error, { avatar });
  }
}

/**
 * Resolve the preference value into an image URI for this device. Managed
 * avatar names resolve against the avatar directory (the absolute path is
 * rebuilt per call, surviving iOS container relocation); direct image URIs
 * pass through.
 */
export async function resolveUserAvatarUri(
  images: UserContentImageStorage,
  avatar: string,
): Promise<string | undefined> {
  const storedName = storedAvatarName(avatar);

  if (storedName) {
    return images.resolve(storedName);
  }

  return DIRECT_IMAGE_URI_PATTERN.test(avatar) ? avatar : undefined;
}

/**
 * Create the new managed image before switching the preference. Preference
 * failure compensates the new file; the previous file is removed only after
 * the new reference is durable.
 */
export async function replaceUserAvatar(
  images: UserContentImageStorage,
  sourceUri: string,
  previousAvatar: string,
  persistAvatar: PersistAvatar,
): Promise<void> {
  const nextName = await images.create(sourceUri);

  try {
    await persistAvatar(`${STORED_AVATAR_PREFIX}${nextName}`);
  } catch (error) {
    try {
      await images.remove(nextName);
    } catch (cleanupError) {
      logger.error(
        'Failed to delete a new user avatar after preference write failed',
        cleanupError as Error,
        {
          storedName: nextName,
        },
      );
    }
    throw error;
  }

  await deleteStoredAvatar(images, previousAvatar);
}
