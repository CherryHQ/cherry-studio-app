import { File } from 'expo-file-system';

import type { FileEntryService } from '@/backend/data/services/FileEntryService';
import { readSourceAiContent } from '@/backend/services/file';
import {
  createInternalEntry,
  getInternalFileUri,
  resolveFileEntry,
} from '@/backend/services/file/fileStorage';

import type { DocumentExportDependencies } from './createDocumentExportSession';

/** The composition root supplies a store bound to this host's database. */
export function createDocumentExportDependencies(
  entries: FileEntryService,
): DocumentExportDependencies {
  return {
    hasAiAssets: async (ids, signal) => {
      signal.throwIfAborted();
      const files = await entries.findAvailableByIds(ids);
      signal.throwIfAborted();
      for (const entry of files) {
        if (entry.aiContent) return true;
        const uri = getInternalFileUri(entry);
        if (uri && (await readSourceAiContent({ ...entry, uri }, signal))) return true;
      }
      return false;
    },
    readManagedImage: async (id, signal) => {
      signal.throwIfAborted();
      const resolved = await resolveFileEntry(entries, id);
      signal.throwIfAborted();
      if (!resolved) throw new Error('Image unavailable');
      const file = new File(resolved.uri);
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
          aiContent: file.aiContent,
        },
        signal,
      );
      const uri = getInternalFileUri(entry);
      if (!uri) throw new Error('Saved export unavailable');
      return { entry, uri };
    },
  };
}
