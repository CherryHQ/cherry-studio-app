import type { TagService } from '@/backend/data/services/TagService';
import {
  CreateTagSchema,
  SetTagEntitiesSchema,
  SyncEntityTagsSchema,
  TagIdSchema,
  type TagSchemas,
  UpdateTagSchema,
} from '@cherrystudio/universal/data/api/schemas/tags';
import type { HandlersFor } from '@cherrystudio/universal/data/api/types';
import { EntityIdSchema, EntityTypeSchema } from '@cherrystudio/universal/data/types/entityType';

export function createTagHandlers(service: TagService): HandlersFor<TagSchemas> {
  return {
    '/tags': {
      GET: async () => service.list(),
      POST: async ({ body }) => service.create(CreateTagSchema.parse(body)),
    },
    '/tags/:id': {
      DELETE: async ({ params }) => service.delete(TagIdSchema.parse(params.id)),
      GET: async ({ params }) => service.getById(TagIdSchema.parse(params.id)),
      PATCH: async ({ body, params }) =>
        service.update(TagIdSchema.parse(params.id), UpdateTagSchema.parse(body)),
    },
    '/tags/:id/entities': {
      PUT: async ({ body, params }) =>
        service.setEntities(TagIdSchema.parse(params.id), SetTagEntitiesSchema.parse(body)),
    },
    '/tags/entities/:entityType/:entityId': {
      GET: async ({ params }) =>
        service.getTagsByEntity(
          EntityTypeSchema.parse(params.entityType),
          EntityIdSchema.parse(params.entityId),
        ),
      PUT: async ({ body, params }) =>
        service.syncEntityTags(
          EntityTypeSchema.parse(params.entityType),
          EntityIdSchema.parse(params.entityId),
          SyncEntityTagsSchema.parse(body),
        ),
    },
  };
}
