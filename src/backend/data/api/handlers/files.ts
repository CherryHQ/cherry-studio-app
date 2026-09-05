import type { FileEntryService } from '@/backend/data/services/FileEntryService';
/**
 * Read-only File DataApi handlers. Keep filesystem-backed operations in the
 * mobile FileModule rather than adding platform routes to FileSchemas.
 */
import type { FileSchemas } from '@/shared/data/api/schemas/files';
import type { HandlersFor } from '@/shared/data/api/types';
import { FileEntryIdSchema } from '@/shared/data/types/file';

export function createFileHandlers(entries: FileEntryService): HandlersFor<FileSchemas> {
  return {
    '/files/entries': {
      GET: ({ query }) => entries.listByCursor(query),
    },
    '/files/entries/:id': {
      GET: ({ params }) => entries.getById(FileEntryIdSchema.parse(params.id)),
    },
  };
}
