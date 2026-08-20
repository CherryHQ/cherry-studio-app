import {
  type FileEntryId,
  FileEntryIdSchema,
  STORED_FILE_REF_PREFIX,
  tagStoredFileRef,
} from '@cherrystudio/universal/data/types/file';
import { loggerService } from '@logger';
import { Directory, File, Paths } from 'expo-file-system';

import type { UserContentImageStorage } from '@/backend/services/file/userContentImageStorage';

const logger = loggerService.withContext('UserAvatarStorage');
const LEGACY_AVATAR_DIRECTORY_NAME = 'user-avatars';
const LEGACY_IMAGE_URI_PATTERN = /^(?:blob:|content:\/\/|data:image\/|file:\/\/|https?:\/\/)/i;

type PersistAvatar = (avatar: string) => Promise<void>;

function legacyAvatarDirectory(): Directory {
  return new Directory(Paths.document, LEGACY_AVATAR_DIRECTORY_NAME);
}

function legacyAvatarFile(fileId: FileEntryId): File {
  return new File(legacyAvatarDirectory(), fileId);
}

function storedFileId(avatar: string): FileEntryId | undefined {
  if (!avatar.startsWith(STORED_FILE_REF_PREFIX) || avatar.startsWith('file://')) {
    return undefined;
  }

  const parsed = FileEntryIdSchema.safeParse(avatar.slice(STORED_FILE_REF_PREFIX.length));
  return parsed.success ? parsed.data : undefined;
}

async function deleteStoredAvatar(images: UserContentImageStorage, avatar: string): Promise<void> {
  const fileId = storedFileId(avatar);

  if (!fileId) {
    return;
  }

  try {
    if (await images.remove(fileId)) {
      return;
    }

    const legacyFile = legacyAvatarFile(fileId);
    if (legacyFile.exists) {
      legacyFile.delete();
    }
  } catch (error) {
    logger.warn('Failed to delete stored user avatar', error as Error, { avatar });
  }
}

/**
 * Resolve the preference value into an image URI for this device. Managed
 * FileEntry references are canonical; the former user-avatars directory and
 * direct image URIs remain read-compatible until their separate cleanup PR.
 */
export async function resolveUserAvatarUri(
  images: UserContentImageStorage,
  avatar: string,
): Promise<string | undefined> {
  const fileId = storedFileId(avatar);

  if (fileId) {
    const managedUri = await images.resolve(fileId);
    if (managedUri) {
      return managedUri;
    }

    const legacyFile = legacyAvatarFile(fileId);
    return legacyFile.exists ? legacyFile.uri : undefined;
  }

  return LEGACY_IMAGE_URI_PATTERN.test(avatar) ? avatar : undefined;
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
  const nextFileId = await images.create(sourceUri);

  try {
    await persistAvatar(tagStoredFileRef(nextFileId));
  } catch (error) {
    try {
      await images.remove(nextFileId);
    } catch (cleanupError) {
      logger.error(
        'Failed to delete a new user avatar after preference write failed',
        cleanupError as Error,
        {
          fileId: nextFileId,
        },
      );
    }
    throw error;
  }

  await deleteStoredAvatar(images, previousAvatar);
}
