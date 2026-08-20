import { type FileEntryId, FileEntryIdSchema } from '@cherrystudio/universal/data/types/file';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { FileEntryService } from '@/backend/data/services/FileEntryService';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { createInternalEntry, discardInternalEntries, getFileUri } from './fileStorage';

const logger = loggerService.withContext('UserContentImageStorage');
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_STORED_BYTES = 2 * 1024 * 1024;
// The mobile profile photo expands into a large hero, so thumbnail-sized output
// is visibly soft even though compact assistant avatars use the same asset.
const AVATAR_DIMENSION = 1024;
const WEBP_QUALITY = 0.82;

type UserContentImageEntries = Pick<FileEntryService, 'create' | 'delete' | 'findById'>;

export type UserContentImageStorage = {
  create(sourceUri: string): Promise<FileEntryId>;
  remove(id: FileEntryId): Promise<boolean>;
  resolve(id: FileEntryId): Promise<string | undefined>;
};

/**
 * Managed storage for images selected by the user. Picker and camera URIs are
 * transient inputs; callers persist only the returned FileEntry id.
 */
export function createUserContentImageStorage(
  entries: UserContentImageEntries,
): UserContentImageStorage {
  return {
    create: async (sourceUri) => {
      let normalizedUri: string | undefined;

      try {
        normalizedUri = await normalizeAvatarImage(sourceUri);
        const entry = await createInternalEntry(entries, {
          cleanupPolicy: 'manual',
          name: 'avatar.webp',
          source: 'uri',
          uri: normalizedUri,
        });
        return entry.id;
      } finally {
        if (normalizedUri) {
          deleteTemporaryImage(normalizedUri);
        }
      }
    },
    remove: async (id) => {
      const safeId = FileEntryIdSchema.parse(id);
      const entry = await entries.findById(safeId);

      if (!entry || entry.origin !== 'internal') {
        return false;
      }

      await discardInternalEntries(entries, [entry]);
      return true;
    },
    resolve: (id) => getFileUri(entries, FileEntryIdSchema.parse(id)),
  };
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
