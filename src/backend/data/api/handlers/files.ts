import {
  ContentHashQuerySchema,
  type FileSchemas,
  ListFilesQuerySchema,
  RefCountsQuerySchema,
  RefsBySourceQuerySchema,
} from '@cherrystudio/universal/data/api/schemas/files';
import type { HandlersFor } from '@cherrystudio/universal/data/api/types';
import { FileEntryIdSchema } from '@cherrystudio/universal/data/types/file';

import type { FileEntryService } from '@/backend/data/services/FileEntryService';
import type { FileRefService } from '@/backend/data/services/FileRefService';

export function createFileHandlers(
  entries: FileEntryService,
  refs: FileRefService,
): HandlersFor<FileSchemas> {
  return {
    '/files/entries': {
      GET: ({ query }) => entries.listCursor(ListFilesQuerySchema.parse(query ?? {})),
    },
    '/files/entries/:id': {
      GET: ({ params }) => entries.getById(FileEntryIdSchema.parse(params.id)),
    },
    '/files/entries/by-content-hash': {
      GET: ({ query }) => {
        const { contentHash } = ContentHashQuerySchema.parse(query);
        return entries.findInternalByContentHash(contentHash);
      },
    },
    '/files/entries/stats': {
      GET: () => entries.getStats(),
    },
    '/files/entries/ref-counts': {
      GET: async ({ query }) => {
        const { entryIds } = RefCountsQuerySchema.parse(query);
        const counts = await refs.countByEntryIds(entryIds);
        return entryIds.map((entryId) => ({
          entryId,
          refCount: counts.get(entryId) ?? 0,
        }));
      },
    },
    '/files/entries/:id/refs': {
      GET: ({ params }) => refs.findByEntryId(FileEntryIdSchema.parse(params.id)),
    },
    '/files/refs': {
      GET: ({ query }) => refs.findBySource(RefsBySourceQuerySchema.parse(query)),
    },
    '/files/:id': {
      GET: ({ params }) => entries.get(params.id),
    },
    '/files/:id/renderable-uri': {
      GET: async ({ params }) => (await entries.resolveRenderableUri(params.id)) ?? null,
    },
    '/files/:id/resolved': {
      GET: ({ params }) => entries.resolve(params.id),
    },
  };
}
