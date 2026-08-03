import {
  DeleteNoteQuerySchema,
  ListNoteQuerySchema,
  type NoteSchemas,
  RewriteNotePathSchema,
  UpsertNoteSchema,
} from '@cherrystudio/universal/data/api/schemas/notes';
import type { HandlersFor } from '@cherrystudio/universal/data/api/types';

import type { NoteService } from '@/backend/data/services/NoteService';

export function createNoteHandlers(service: NoteService): HandlersFor<NoteSchemas> {
  return {
    '/notes': {
      DELETE: async ({ query }) => service.deleteByPath(DeleteNoteQuerySchema.parse(query)),
      GET: async ({ query }) => service.listByRoot(ListNoteQuerySchema.parse(query).rootPath),
      PATCH: async ({ body }) => service.upsert(UpsertNoteSchema.parse(body)),
    },
    '/notes/path': {
      PATCH: async ({ body }) => service.rewritePath(RewriteNotePathSchema.parse(body)),
    },
  };
}
