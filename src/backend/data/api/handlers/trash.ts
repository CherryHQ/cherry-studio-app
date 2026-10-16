import * as z from 'zod';

import type { TrashService } from '@/backend/data/services/TrashService';
import type { TrashSchemas } from '@/shared/data/api/schemas/trash';
import type { HandlersFor } from '@/shared/data/api/types';

export type TrashMutations = {
  delete(id: string): Promise<void>;
  empty(): Promise<void>;
  restore(id: string): Promise<void>;
};
const paramsSchema = z.strictObject({ id: z.uuid() });

export function createTrashHandlers(
  entries: TrashService,
  mutations: TrashMutations,
): HandlersFor<TrashSchemas> {
  return {
    '/trash': {
      GET: ({ query, signal }) => entries.list(query ?? {}, signal),
      DELETE: () => mutations.empty(),
    },
    '/trash/summary': { GET: () => entries.summary() },
    '/trash/:id': {
      DELETE: ({ params }) => {
        const { id } = paramsSchema.parse(params);
        return mutations.delete(id);
      },
    },
    '/trash/:id/restore': {
      POST: ({ params }) => {
        const { id } = paramsSchema.parse(params);
        return mutations.restore(id);
      },
    },
  };
}
