import { fileEntryService } from '@/backend/data/services/FileEntryService';
import type { ResolvedFile } from '@/shared/contracts/file';
import {
  canEditFileImage,
  EditFileImageInputSchema,
  type EditFileImageInput,
} from '@/shared/contracts/fileImageEdit';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { nextVersionFilename, type FileEntry } from '@/shared/data/types/file';

import { generateFilePreviewUri } from './filePreviewStorage';
import { createInternalEntry, discardInternalEntries, resolveFileEntry } from './fileStorage';
import { renderEditedImage } from './renderEditedImage';

const logger = loggerService.withContext('editFileImage');

/** Pixel writes and managed-file ownership stay behind the file module. */
export async function editFileImage(
  input: EditFileImageInput,
  signal?: AbortSignal,
): Promise<ResolvedFile> {
  const edit = EditFileImageInputSchema.parse(input);
  signal?.throwIfAborted();
  const source = await resolveFileEntry(fileEntryService, edit.fileEntryId);
  if (!source || !canEditFileImage(source.entry.mediaType)) {
    throw new Error('This file is not an editable still image.');
  }
  signal?.throwIfAborted();

  let temporary: Awaited<ReturnType<typeof renderEditedImage>> | undefined;
  let entry: FileEntry | undefined;
  let committed = false;
  try {
    temporary = await renderEditedImage(source.uri, source.entry.mediaType, edit, signal);
    signal?.throwIfAborted();
    entry = await createInternalEntry(
      fileEntryService,
      {
        uri: temporary.uri,
        name: nextVersionFilename(source.entry.filename),
        mediaType: source.entry.mediaType,
        provenance: source.entry.provenance,
        source: 'uri',
      },
      signal,
    );
    signal?.throwIfAborted();
    await generateFilePreviewUri(entry);
    signal?.throwIfAborted();
    const resolved = await resolveFileEntry(fileEntryService, entry.id);
    if (!resolved) throw new Error('Edited image cannot be resolved.');
    signal?.throwIfAborted();
    committed = true;
    return resolved;
  } finally {
    try {
      temporary?.release();
    } catch (error) {
      logger.warn('Failed to discard image editing cache', error as Error);
    }
    if (!committed && entry) await discardInternalEntries(fileEntryService, [entry]);
  }
}
