import type { PaintingListQuery, PaintingSchemas } from '@/shared/data/api/schemas/paintings';
import type { HandlersFor } from '@/shared/data/api/types';
import type { Painting } from '@/shared/data/types/painting';

export type PaintingData = {
  get(id: string): Promise<Painting>;
  listIds(): Promise<string[]>;
  listPage(query?: PaintingListQuery): Promise<{ items: Painting[]; nextCursor?: string }>;
  removeMany(ids: readonly string[]): Promise<void>;
};

export function createPaintingHandlers(service: PaintingData): HandlersFor<PaintingSchemas> {
  return {
    '/paintings': {
      DELETE: ({ query }) => service.removeMany(query.ids),
      GET: ({ query }) => service.listPage(query),
    },
    '/paintings/ids': {
      GET: () => service.listIds(),
    },
    '/paintings/:id': {
      GET: ({ params }) => service.get(params.id),
    },
  };
}
