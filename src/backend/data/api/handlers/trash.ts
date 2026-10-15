import * as z from 'zod';

import type { TrashService } from '@/backend/data/services/TrashService';
import {
  TrashFilterSchema,
  TrashKindSchema,
  type TrashFilter,
  type TrashKind,
  type TrashSchemas,
} from '@/shared/data/api/schemas/trash';
import type { HandlersFor } from '@/shared/data/api/types';

export type TrashMutations = {
  delete(kind: TrashKind, id: string): Promise<void>;
  empty(kind: TrashFilter): Promise<void>;
  restore(kind: TrashKind, id: string): Promise<void>;
};
const paramsSchema = z.strictObject({ kind: TrashKindSchema, id: z.uuid() });

export function createTrashHandlers(
  entries: TrashService,
  mutations: TrashMutations,
): HandlersFor<TrashSchemas> {
  return {
    '/trash': {
      GET: ({ query, signal }) => entries.list(query ?? {}, signal),
      DELETE: ({ query }) => mutations.empty(TrashFilterSchema.parse(query?.kind ?? 'all')),
    },
    '/trash/summary': { GET: () => entries.summary() },
    '/trash/:kind/:id': {
      DELETE: ({ params }) => {
        const { kind, id } = paramsSchema.parse(params);
        return mutations.delete(kind, id);
      },
    },
    '/trash/:kind/:id/restore': {
      POST: ({ params }) => {
        const { kind, id } = paramsSchema.parse(params);
        return mutations.restore(kind, id);
      },
    },
  };
}
