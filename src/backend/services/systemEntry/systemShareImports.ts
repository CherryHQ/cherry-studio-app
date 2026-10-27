import type { FileEntryService } from '@/backend/data/services/FileEntryService';
import { getInternalFileUri } from '@/backend/services/file/fileStorage';
import { importManagedFile } from '@/backend/services/file/importManagedFile';
import type { SystemSharedFile } from '@/shared/contracts';

import type { NativeSystemEntry } from '../../../../modules/system-integration';

/**
 * Copies a share's attachments into the file library through the same import as a picked file. An
 * imported file belongs to the library immediately, so an unsent share leaves the files behind rather
 * than a staging area to reconcile.
 */
export function createSystemShareImporter(entries: FileEntryService) {
  return async function importSharedFiles(
    entry: NativeSystemEntry,
    signal: AbortSignal,
  ): Promise<SystemSharedFile[]> {
    const files: SystemSharedFile[] = [];
    for (const attachment of entry.files) {
      signal.throwIfAborted();
      const created = await importManagedFile(entries, {
        uri: attachment.uri,
        name: attachment.name,
        mediaType: attachment.mediaType,
      });
      const uri = getInternalFileUri(created);
      if (!uri) throw new Error('Shared file is unavailable');
      files.push({
        fileEntryId: created.id,
        mediaType: created.mediaType,
        name: created.filename,
        size: created.size,
        uri,
      });
    }
    return files;
  };
}
