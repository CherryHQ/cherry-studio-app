/**
 * Read-only File DataApi handlers. Keep filesystem-backed operations in the
 * mobile FileModule rather than adding platform routes to FileSchemas.
 */
import type { FileSchemas } from '@cherrystudio/universal/data/api/schemas/files';
import type { HandlersFor } from '@cherrystudio/universal/data/api/types';
import { FileEntryIdSchema } from '@cherrystudio/universal/data/types/file';

import type { FileEntryService } from '@/backend/data/services/FileEntryService';

export function createFileHandlers(entries: FileEntryService): HandlersFor<FileSchemas> {
  return {
    '/files/entries/:id': {
      GET: ({ params }) => entries.getById(FileEntryIdSchema.parse(params.id)),
    },
  };
}
