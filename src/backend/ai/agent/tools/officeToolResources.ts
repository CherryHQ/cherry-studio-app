import {
  OfficeGenerationError,
  OFFICE_MAX_IMAGE_BYTES,
  type OfficeImage,
} from '@/backend/services/office';
import { createConcurrencySlots } from '@/backend/utils/concurrencySlots';
import { FileEntryIdSchema } from '@/shared/data/types/file';
import type { FileEntry, FileEntryProvenance } from '@/shared/data/types/file';
import type { FilePlacement } from '@/shared/data/types/fileLibrary';

import type { ManagedFileResolver } from '../resources/managedFileResolver';

export type OfficeFiles = Pick<
  ManagedFileResolver,
  'readImage' | 'readAsBytes' | 'resolveAvailable'
> & {
  createBytesEntry(
    input: FilePlacement & {
      data: Uint8Array;
      mediaType: string;
      name: string;
      provenance: FileEntryProvenance;
    },
    signal: AbortSignal,
  ): Promise<FileEntry>;
};

// Source/image reads, native compute and publication share a bounded lifetime.
export const officeOperationSlots = createConcurrencySlots(2);

export async function readOfficeImages(
  ids: string[],
  files: OfficeFiles,
  signal: AbortSignal,
): Promise<Record<string, OfficeImage>> {
  const images: Record<string, OfficeImage> = {};
  if (!ids.length) return images;
  const facts = await files.resolveAvailable(ids.map((id) => FileEntryIdSchema.parse(id)));
  signal.throwIfAborted();
  let totalBytes = 0;
  for (const id of ids) {
    const fact = facts.get(id);
    if (
      !fact ||
      !Number.isSafeInteger(fact.size) ||
      fact.size <= 0 ||
      !['image/png', 'image/jpeg'].includes(fact.mediaType)
    ) {
      throw new OfficeGenerationError('An image is unavailable or is not PNG/JPEG.');
    }
    totalBytes += fact.size;
  }
  if (totalBytes > OFFICE_MAX_IMAGE_BYTES)
    throw new OfficeGenerationError('Images exceed 2 MiB. Use smaller images.');
  let encodedBytes = 0;
  for (const id of ids) {
    signal.throwIfAborted();
    const image = await files.readImage?.(facts.get(id)!, signal);
    signal.throwIfAborted();
    if (!image || (image.mediaType !== 'image/png' && image.mediaType !== 'image/jpeg')) {
      throw new OfficeGenerationError('An image could not be read as PNG/JPEG.');
    }
    encodedBytes += Math.ceil(image.data.length / 4) * 3;
    if (encodedBytes > OFFICE_MAX_IMAGE_BYTES)
      throw new OfficeGenerationError(
        'Images exceed 2 MiB after normalization. Use smaller images.',
      );
    images[id] = { data: image.data, mediaType: image.mediaType };
  }
  return images;
}
