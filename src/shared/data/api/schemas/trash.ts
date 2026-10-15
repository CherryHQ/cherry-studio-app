import * as z from 'zod';

import type { CursorPaginationResponse } from '@/shared/data/api/types';

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const TrashKindSchema = z.enum(['session', 'file']);
export type TrashKind = z.infer<typeof TrashKindSchema>;
export const TrashFilterSchema = z.enum(['all', 'session', 'file']);
export type TrashFilter = z.infer<typeof TrashFilterSchema>;
export const TrashQuerySchema = z.strictObject({
  kind: TrashFilterSchema.default('all'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(30),
});
export type TrashItem = {
  id: string;
  kind: TrashKind;
  title: string;
  deletedAt: number;
  /** Permanent deletion has committed once state is `deleting`; only unlinking can be retried. */
  state: 'trashed' | 'deleting';
  /** File bytes only; conversations do not own attachment bytes. */
  size: number;
};
/** Pending unlinks remain counted until both the blob and preview have been removed. */
export type TrashSummary = { files: number; sessions: number; fileBytes: number };
export type TrashSchemas = {
  '/trash': {
    GET: {
      query?: z.input<typeof TrashQuerySchema>;
      response: CursorPaginationResponse<TrashItem>;
    };
    DELETE: { query?: { kind?: TrashFilter }; response: undefined };
  };
  '/trash/summary': { GET: { response: TrashSummary } };
  '/trash/:kind/:id': {
    DELETE: { params: { kind: TrashKind; id: string }; response: undefined };
  };
  '/trash/:kind/:id/restore': {
    POST: { params: { kind: TrashKind; id: string }; response: undefined };
  };
};
