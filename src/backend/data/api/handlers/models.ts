import type { ModelService } from '@/backend/data/services/ModelService';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import type { OrderRequest } from '@/shared/data/api/schemas/endpointHelpers';
import {
  BulkUpdateModelsSchema,
  CreateModelsSchema,
  DeleteModelsQuerySchema,
  ListModelsQuerySchema,
  type ModelSchemas,
  OrderBatchRequestSchema,
  OrderRequestSchema,
  ResolveProviderModelsQuerySchema,
  UpdateModelSchema,
} from '@/shared/data/api/schemas/models';
import type { HandlersFor } from '@/shared/data/api/types';
import {
  isUniqueModelId,
  type Model,
  parseUniqueModelId,
  type UniqueModelId,
} from '@/shared/data/types/model';

export type SystemModelSupportFilter = {
  filter(models: readonly Model[]): Promise<Model[]>;
};

function parseUniqueId(uniqueModelId: string) {
  if (!isUniqueModelId(uniqueModelId)) {
    throw DataApiErrorFactory.validation({
      uniqueModelId: [`Expected "providerId::modelId", got "${uniqueModelId}"`],
    });
  }
  return parseUniqueModelId(uniqueModelId);
}

function validateModelOrderAnchor(anchor: OrderRequest) {
  if ('before' in anchor) {
    parseUniqueId(anchor.before);
  } else if ('after' in anchor) {
    parseUniqueId(anchor.after);
  }
}

export function createModelHandlers(
  service: ModelService,
  systemModelSupport: SystemModelSupportFilter,
): HandlersFor<ModelSchemas> {
  return {
    '/models': {
      DELETE: async ({ query }) => {
        const parsed = DeleteModelsQuerySchema.parse(query);
        await service.bulkDelete(parsed.ids.map(parseUniqueId));
      },
      GET: async ({ query }) => {
        const { isSystemSupported, ...listQuery } = ListModelsQuerySchema.parse(query ?? {});
        const models = await service.list(listQuery);

        if (isSystemSupported === undefined) {
          return models;
        }

        const supportedModels = await systemModelSupport.filter(models);
        if (isSystemSupported) {
          return supportedModels;
        }

        const supportedIds = new Set(supportedModels.map((model) => model.id));
        return models.filter((model) => !supportedIds.has(model.id));
      },
      PATCH: async ({ body }) =>
        service.bulkUpdate(
          BulkUpdateModelsSchema.parse(body).map(({ patch, uniqueModelId }) => ({
            ...parseUniqueId(uniqueModelId),
            patch,
          })),
        ),
      POST: async ({ body }) => service.createDtos(CreateModelsSchema.parse(body)),
    },
    '/models/:uniqueModelId*': {
      DELETE: async ({ params }) => {
        const { modelId, providerId } = parseUniqueId(params.uniqueModelId);
        await service.deleteByKey(providerId, modelId);
      },
      GET: async ({ params }) => {
        const { modelId, providerId } = parseUniqueId(params.uniqueModelId);
        return service.getByKey(providerId, modelId);
      },
      PATCH: async ({ body, params }) => {
        const { modelId, providerId } = parseUniqueId(params.uniqueModelId);
        return service.update(providerId, modelId, UpdateModelSchema.parse(body));
      },
    },
    '/model-orders/:uniqueModelId*': {
      PATCH: async ({ body, params }) => {
        parseUniqueId(params.uniqueModelId);
        const anchor = OrderRequestSchema.parse(body);
        validateModelOrderAnchor(anchor);
        await service.reorder(params.uniqueModelId as UniqueModelId, anchor);
      },
    },
    '/models/order:batch': {
      PATCH: async ({ body }) => {
        const { moves } = OrderBatchRequestSchema.parse(body);
        for (const move of moves) {
          parseUniqueId(move.id);
          validateModelOrderAnchor(move.anchor);
        }
        await service.reorderBatch(moves as { anchor: OrderRequest; id: UniqueModelId }[]);
      },
    },
    '/providers/:providerId/models:resolve': {
      GET: async ({ params, query }) => {
        const parsed = ResolveProviderModelsQuerySchema.parse(query ?? {});
        return service.resolveRegistryModels(
          params.providerId,
          Array.isArray(parsed.ids) ? parsed.ids : [parsed.ids],
        );
      },
    },
    '/providers/:providerId/models/:modelId*/image-generation-support': {
      GET: async ({ params }) => {
        const [model] = await service.resolveRegistryModels(params.providerId, [params.modelId]);
        return model?.imageGeneration ?? null;
      },
    },
  };
}
