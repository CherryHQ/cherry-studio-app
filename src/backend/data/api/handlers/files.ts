import * as z from 'zod';

import type { FileEntryService } from '@/backend/data/services/FileEntryService';
import {
  fileLibraryService,
  type FileLibraryService,
} from '@/backend/data/services/FileLibraryService';
/**
 * File-library metadata handlers. Keep filesystem-backed operations in the
 * mobile FileModule rather than adding platform routes to FileSchemas.
 */
import type { FileSchemas } from '@/shared/data/api/schemas/files';
import {
  FileLibraryQuerySchema,
  CreateFileFolderSchema,
  UpdateFileFolderSchema,
  UpdateLibraryFileSchema,
} from '@/shared/data/api/schemas/files';
import type { HandlersFor } from '@/shared/data/api/types';
import { FileEntryIdSchema } from '@/shared/data/types/file';

export function createFileHandlers(
  entries: FileEntryService,
  library: FileLibraryService = fileLibraryService,
): HandlersFor<FileSchemas> {
  return {
    '/files/library': {
      GET: ({ query }) => library.list(FileLibraryQuerySchema.parse(query ?? {})),
    },
    '/files/library/:id': {
      PATCH: ({ params, body }) =>
        library.updateFile(z.uuid().parse(params.id), UpdateLibraryFileSchema.parse(body)),
    },
    '/files/history': {
      GET: ({ query }) => library.history(z.uuid().parse(query.id)),
    },
    '/files/versions/:id': {
      DELETE: async ({ params }) =>
        void (await library.trashFileEntry(z.uuid().parse(params.id), true)),
    },
    '/files/folders': {
      GET: () => library.folders(),
      POST: ({ body }) => {
        const input = CreateFileFolderSchema.parse(body);
        return library.createFolder(input.parentId, input.name);
      },
    },
    '/files/folders/:id': {
      PATCH: ({ params, body }) =>
        library.updateFolder(z.uuid().parse(params.id), UpdateFileFolderSchema.parse(body)),
      DELETE: async ({ params }) => void (await library.trashFolder(z.uuid().parse(params.id))),
    },
    '/files/workspace': {
      GET: ({ query }) => library.workspaceBinding(z.string().min(1).parse(query.sessionId)),
    },
    '/files/workspace/:id': {
      PATCH: ({ params, body }) =>
        library.bindWorkspace(params.id, z.uuid().nullable().parse(body.folderId)),
    },
    '/files/entries': {
      GET: ({ query }) => entries.listByCursor(query),
    },
    '/files/entries/:id': {
      GET: ({ params }) => entries.getById(FileEntryIdSchema.parse(params.id)),
    },
  };
}
