import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { loggerService } from '@/shared/core/logger/LoggerService';

const logger = loggerService.withContext('UserContentImageStorage');
const AVATAR_DIRECTORY_NAME = 'user-avatar';
const STORED_AVATAR_NAME_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.webp$/i;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_STORED_BYTES = 2 * 1024 * 1024;
// The mobile profile photo expands into a large hero, so thumbnail-sized output
// is visibly soft even though compact assistant avatars use the same asset.
const AVATAR_DIMENSION = 1024;
const WEBP_QUALITY = 0.82;

export type UserContentImageStorage = {
  create(sourceUri: string): Promise<string>;
  remove(storedName: string): Promise<boolean>;
  resolve(storedName: string): Promise<string | undefined>;
};

/**
 * Plain-directory storage for the user's profile image. Deliberately outside
 * the `file_entry` model: the avatar is a settings value, not a document — it
 * must not surface in the file library, and its lifecycle is "replace or
 * reset", which a fixed directory expresses without any reference bookkeeping.
 * Picker and camera URIs are transient inputs; callers persist only the
 * returned stored name (`{uuid}.webp`).
 */
export function createUserContentImageStorage(): UserContentImageStorage {
  return {
    create: async (sourceUri) => {
      let normalizedUri: string | undefined;

      try {
        normalizedUri = await normalizeAvatarImage(sourceUri);
        const storedName = `${randomUUID()}.webp`;
        new File(normalizedUri).copy(new File(ensureAvatarDirectory(), storedName));
        return storedName;
      } finally {
        if (normalizedUri) {
          deleteTemporaryImage(normalizedUri);
        }
      }
    },
    remove: async (storedName) => {
      const file = storedAvatarFile(storedName);
      if (!file?.exists) {
        return false;
      }
      file.delete();
      return true;
    },
    resolve: async (storedName) => {
      const file = storedAvatarFile(storedName);
      return file?.exists ? file.uri : undefined;
    },
  };
}

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

function storedAvatarFile(storedName: string): File | undefined {
  return STORED_AVATAR_NAME_PATTERN.test(storedName)
    ? new File(avatarDirectory(), storedName)
    : undefined;
}

async function normalizeAvatarImage(sourceUri: string): Promise<string> {
  const sourceFile = new File(sourceUri);
  assertUsableFile(sourceFile, MAX_SOURCE_BYTES, 'Selected image');

  const sourceContext = ImageManipulator.manipulate(sourceUri);
  let sourceImage: Awaited<ReturnType<typeof sourceContext.renderAsync>> | undefined;
  let outputContext: ReturnType<typeof ImageManipulator.manipulate> | undefined;
  let outputImage: Awaited<ReturnType<typeof sourceContext.renderAsync>> | undefined;
  let outputUri: string | undefined;

  try {
    sourceImage = await sourceContext.renderAsync();
    const cropSize = Math.min(sourceImage.width, sourceImage.height);

    if (!Number.isFinite(cropSize) || cropSize <= 0) {
      throw new Error('Selected image has invalid dimensions');
    }

    outputContext = ImageManipulator.manipulate(sourceImage);
    outputContext
      .crop({
        height: cropSize,
        originX: Math.floor((sourceImage.width - cropSize) / 2),
        originY: Math.floor((sourceImage.height - cropSize) / 2),
        width: cropSize,
      })
      .resize({ height: AVATAR_DIMENSION, width: AVATAR_DIMENSION });
    outputImage = await outputContext.renderAsync();
    const result = await outputImage.saveAsync({
      compress: WEBP_QUALITY,
      format: SaveFormat.WEBP,
    });
    outputUri = result.uri;
    assertUsableFile(new File(outputUri), MAX_STORED_BYTES, 'Normalized image');
    return outputUri;
  } catch (error) {
    if (outputUri) {
      deleteTemporaryImage(outputUri);
    }
    throw error;
  } finally {
    outputImage?.release();
    outputContext?.release();
    sourceImage?.release();
    sourceContext.release();
  }
}

function assertUsableFile(file: File, maxBytes: number, label: string): void {
  if (!file.exists) {
    throw new Error(`${label} does not exist`);
  }

  const size = file.size;
  if (size === null || !Number.isSafeInteger(size) || size < 0) {
    throw new Error(`${label} has an invalid size`);
  }
  if (size > maxBytes) {
    throw new Error(`${label} exceeds the ${Math.floor(maxBytes / 1024 / 1024)} MB limit`);
  }
}

function deleteTemporaryImage(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch (error) {
    logger.warn('Failed to delete a normalized temporary image', error as Error, { uri });
  }
}
