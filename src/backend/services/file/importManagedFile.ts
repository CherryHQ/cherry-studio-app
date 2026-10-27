import type { FileEntryService } from '@/backend/data/services/FileEntryService';
import type { FileEntry } from '@/shared/data/types/file';

import { createInternalEntryWithPreview } from './filePreviewStorage';
import { discardNormalizedImage, normalizeImportedImage } from './importedImageNormalization';

/**
 * Copies a transient picker, camera, or share URI into managed storage as an imported file.
 * An oversized still image is re-encoded here, once, so the managed file is already what a model
 * request can carry; nothing downstream resizes it again.
 */
export async function importManagedFile(
  entries: Pick<FileEntryService, 'create' | 'delete'>,
  input: { folderId?: string | null; mediaType?: string; name?: string; uri: string },
): Promise<FileEntry> {
  const normalized = await normalizeImportedImage(input);
  try {
    return await createInternalEntryWithPreview(entries, {
      ...input,
      ...normalized,
      provenance: 'imported',
      source: 'uri',
    });
  } finally {
    if (normalized) discardNormalizedImage(normalized);
  }
}
