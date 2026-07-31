import type { AddModelInput, ModelListQuery, ModelSchemas } from '@/shared/data/api/schemas/models';
import type { HandlersFor } from '@/shared/data/api/types';
import type { Model, UniqueModelId } from '@/shared/data/types/model';

export type ModelData = {
  add(inputs: readonly AddModelInput[]): Promise<Model[]>;
  get(id: UniqueModelId): Promise<Model | null>;
  list(query?: ModelListQuery): Promise<Model[]>;
  remove(id: UniqueModelId): Promise<boolean>;
};

export function createModelHandlers(service: ModelData): HandlersFor<ModelSchemas> {
  return {
    '/models': {
      GET: ({ query }) => service.list(query),
      POST: ({ body }) => service.add(body),
    },
    '/models/:id': {
      DELETE: ({ params }) => service.remove(params.id),
      GET: ({ params }) => service.get(params.id),
    },
  };
}
