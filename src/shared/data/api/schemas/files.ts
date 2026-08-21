/**
 * Read-only, SQL-first File DataApi contract.
 *
 * Filesystem access, physical URI resolution, and mutations belong to the host
 * platform file capability. Deliberately minimal: the future file-library
 * iteration adds its own list/stat routes when it has a consumer for them.
 */
import type { FileEntry, FileEntryId } from '@/shared/data/types/file';

export type FileSchemas = {
  '/files/entries/:id': {
    GET: {
      params: { id: FileEntryId };
      response: FileEntry;
    };
  };
};
