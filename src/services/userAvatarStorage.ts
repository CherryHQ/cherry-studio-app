import { loggerService } from '@logger';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

const logger = loggerService.withContext('UserAvatarStorage');
const AVATAR_DIRECTORY_NAME = 'user-avatars';
const STORED_FILE_REF_PREFIX = 'file:';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_IMAGE_URI_PATTERN = /^(?:blob:|content:\/\/|data:image\/|file:\/\/|https?:\/\/)/i;

type PersistAvatar = (avatar: string) => Promise<void>;

function avatarDirectory(): Directory {
  return new Directory(Paths.document, AVATAR_DIRECTORY_NAME);
}

function ensureAvatarDirectory(): Directory {
  const directory = avatarDirectory();

  if (!directory.exists) {
    directory.create({ intermediates: true });
  }

  return directory;
}

function avatarFile(fileId: string): File {
  return new File(avatarDirectory(), fileId);
}

function storedFileId(avatar: string): string | undefined {
  if (!avatar.startsWith(STORED_FILE_REF_PREFIX) || avatar.startsWith('file://')) {
    return undefined;
  }

  const fileId = avatar.slice(STORED_FILE_REF_PREFIX.length);
  return UUID_PATTERN.test(fileId) ? fileId : undefined;
}

function deleteStoredAvatar(avatar: string): void {
  const fileId = storedFileId(avatar);

  if (!fileId) {
    return;
  }

  try {
    const file = avatarFile(fileId);

    if (file.exists) {
      file.delete();
    }
  } catch (error) {
    logger.warn('Failed to delete stored user avatar', error as Error, { avatar });
  }
}

/**
 * Resolve the preference value into an image URI for this device. New avatars
 * use a path-resilient `file:<uuid>` reference; legacy image URIs still render.
 */
export function resolveUserAvatarUri(avatar: string): string | undefined {
  const fileId = storedFileId(avatar);

  if (fileId) {
    const file = avatarFile(fileId);
    return file.exists ? file.uri : undefined;
  }

  return LEGACY_IMAGE_URI_PATTERN.test(avatar) ? avatar : undefined;
}

async function storeUserAvatar(sourceUri: string): Promise<string> {
  ensureAvatarDirectory();

  const fileId = randomUUID();
  const destination = avatarFile(fileId);

  try {
    await new File(sourceUri).copy(destination);
  } catch (error) {
    deleteStoredAvatar(`${STORED_FILE_REF_PREFIX}${fileId}`);
    throw error;
  }

  return `${STORED_FILE_REF_PREFIX}${fileId}`;
}

/**
 * Replace the stored avatar without exposing a temporary picker URI. The new
 * file is compensated if the preference write fails; the old file is removed
 * only after the new preference value is durable.
 */
export async function replaceUserAvatar(
  sourceUri: string,
  previousAvatar: string,
  persistAvatar: PersistAvatar,
): Promise<void> {
  const nextAvatar = await storeUserAvatar(sourceUri);

  try {
    await persistAvatar(nextAvatar);
  } catch (error) {
    deleteStoredAvatar(nextAvatar);
    throw error;
  }

  deleteStoredAvatar(previousAvatar);
}
