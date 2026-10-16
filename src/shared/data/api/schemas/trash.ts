import * as z from 'zod';

import type { CursorPaginationResponse } from '@/shared/data/api/types';

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const TrashQuerySchema = z.strictObject({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(30),
});
export type TrashItem = {
  id: string;
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
  '/trash/:id': {
    DELETE: { params: { id: string }; response: undefined };
  };
  '/trash/:id/restore': {
    POST: { params: { id: string }; response: undefined };
  };
};
