import { File } from 'expo-file-system';

import type { FileEntryService } from '@/backend/data/services/FileEntryService';
import {
  createInternalEntry,
  getInternalFileUri,
  resolveFileEntry,
} from '@/backend/services/file/fileStorage';

import type { DocumentExportDependencies } from './createDocumentExportSession';
import { MAX_ASSET_BYTES } from './resolveDocumentAssets';

/** The composition root supplies a store bound to this host's database. */
export function createDocumentExportDependencies(
  entries: FileEntryService,
): DocumentExportDependencies {
  return {
    readManagedImage: async (id, signal) => {
      signal.throwIfAborted();
      const resolved = await resolveFileEntry(entries, id);
      signal.throwIfAborted();
      if (!resolved) throw new Error('Image unavailable');
      const file = new File(resolved.uri);
      if (file.size > MAX_ASSET_BYTES) throw new Error('Image exceeds byte limit');
      return file.bytes();
    },
    saveFile: async (file, signal) => {
      const entry = await createInternalEntry(
        entries,
        {
          source: 'uri',
          uri: file.uri,
          name: file.filename,
          mediaType: file.mediaType,
          provenance: 'document-export',
        },
        signal,
      );
      const uri = getInternalFileUri(entry);
      if (!uri) throw new Error('Saved export unavailable');
      return { entry, uri };
    },
  };
}
