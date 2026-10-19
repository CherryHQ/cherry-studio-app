import * as z from 'zod';

import type { CursorPaginationResponse } from '@/shared/data/api/types';

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const TrashKindSchema = z.enum(['file', 'folder']);
export type TrashKind = z.infer<typeof TrashKindSchema>;
export const TrashQuerySchema = z.strictObject({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(30),
});
export type TrashItem = {
  id: string;
  kind: TrashKind;
  thumbnailEntryId: string | null;
  title: string;
  deletedAt: number;
  size: number;
};
export type TrashSummary = { files: number; fileBytes: number };
export type TrashSchemas = {
  '/trash': {
    GET: {
      query?: z.input<typeof TrashQuerySchema>;
      response: CursorPaginationResponse<TrashItem>;
    };
    DELETE: { response: undefined };
  };
  '/trash/summary': { GET: { response: TrashSummary } };
  '/trash/:kind/:id': {
    DELETE: { params: { kind: TrashKind; id: string }; response: undefined };
  };
  '/trash/:kind/:id/restore': {
    POST: { params: { kind: TrashKind; id: string }; response: undefined };
  };
};
