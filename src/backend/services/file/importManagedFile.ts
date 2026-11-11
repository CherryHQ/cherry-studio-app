import { File } from 'expo-file-system';

import type { FileEntryService } from '@/backend/data/services/FileEntryService';
import type { FileEntry } from '@/shared/data/types/file';
import { imageMediaTypeFromExtension } from '@/shared/utils/imageFileTypes';

import { readSourceAiContent } from './aiContentMetadata';
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
  signal?: AbortSignal,
): Promise<FileEntry> {
  signal?.throwIfAborted();
  const source = new File(input.uri);
  const aiContentLabel = await readSourceAiContent(
    {
      uri: input.uri,
      mediaType:
        input.mediaType ||
        source.type ||
        imageMediaTypeFromExtension(source.extension?.replace(/^\./, '')),
    },
    signal,
  );
  const normalized = await normalizeImportedImage(input);
  try {
    signal?.throwIfAborted();
    return await createInternalEntryWithPreview(
      entries,
      {
        ...input,
        ...normalized,
        provenance: 'imported',
        aiContentLabel,
        source: 'uri',
      },
      signal,
    );
  } finally {
    if (normalized) discardNormalizedImage(normalized);
  }
}
