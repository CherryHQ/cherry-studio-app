import {
  ContentHashQuerySchema,
  type FileSchemas,
  ImportFileBodySchema,
  ListFilesQuerySchema,
  RefCountsQuerySchema,
  RefsBySourceQuerySchema,
  type ResolvedFile,
} from '@cherrystudio/universal/data/api/schemas/files';
import type { HandlersFor } from '@cherrystudio/universal/data/api/types';
import { type FileEntryId, FileEntryIdSchema } from '@cherrystudio/universal/data/types/file';

import type { FileEntryService } from '@/backend/data/services/FileEntryService';
import type { FileRefService } from '@/backend/data/services/FileRefService';

export type FileContentOperations = {
  discardUnreferenced(id: FileEntryId): Promise<boolean>;
  import(input: { name?: string; uri: string }): Promise<ResolvedFile>;
  resolve(id: FileEntryId): Promise<ResolvedFile | null>;
  resolveRenderableUri(id: FileEntryId): Promise<string | undefined>;
};

export function createFileHandlers(
  entries: FileEntryService,
  refs: FileRefService,
  content: FileContentOperations,
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
      DELETE: async ({ params }) => ({
        deleted: await content.discardUnreferenced(FileEntryIdSchema.parse(params.id)),
      }),
      GET: ({ params }) => entries.get(FileEntryIdSchema.parse(params.id)),
    },
    '/files/import': {
      POST: ({ body }) => content.import(ImportFileBodySchema.parse(body)),
    },
    '/files/:id/renderable-uri': {
      GET: async ({ params }) =>
        (await content.resolveRenderableUri(FileEntryIdSchema.parse(params.id))) ?? null,
    },
    '/files/:id/resolved': {
      GET: ({ params }) => content.resolve(FileEntryIdSchema.parse(params.id)),
    },
  };
}
