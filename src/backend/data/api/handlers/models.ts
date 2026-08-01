import type { ModelService } from '@/backend/data/services/ModelService';
import { providerRegistryService } from '@/backend/data/services/ProviderRegistryService';
import { DataApiErrorFactory } from '@cherrystudio/shared/data/api/errors';
import {
  BulkUpdateModelsSchema,
  CreateModelsSchema,
  DeleteModelsQuerySchema,
  ListModelsQuerySchema,
  type ModelSchemas,
  ReconcileProviderModelsSchema,
  ResolveProviderModelsQuerySchema,
  UpdateModelSchema,
} from '@cherrystudio/shared/data/api/schemas/models';
import type { HandlersFor } from '@cherrystudio/shared/data/api/types';
import { isUniqueModelId, parseUniqueModelId } from '@cherrystudio/shared/data/types/model';

function parseUniqueId(uniqueModelId: string) {
  if (!isUniqueModelId(uniqueModelId)) {
    throw DataApiErrorFactory.validation({
      uniqueModelId: [`Expected "providerId::modelId", got "${uniqueModelId}"`],
    });
  }
  return parseUniqueModelId(uniqueModelId);
}

export function createModelHandlers(service: ModelService): HandlersFor<ModelSchemas> {
  return {
    '/models': {
      DELETE: async ({ query }) => {
        const parsed = DeleteModelsQuerySchema.parse(query);
        await service.bulkDelete(parsed.ids.map(parseUniqueId));
      },
      GET: async ({ query }) => service.list(ListModelsQuerySchema.parse(query ?? {})),
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
    '/providers/:providerId/models:reconcile': {
      POST: async ({ body, params }) => {
        const parsed = ReconcileProviderModelsSchema.parse(body);
        for (const model of parsed.toAdd) {
          if (model.providerId !== params.providerId) {
            throw DataApiErrorFactory.validation({
              providerId: [
                `toAdd item providerId '${model.providerId}' does not match URL providerId '${params.providerId}'`,
              ],
            });
          }
        }
        for (const uniqueId of parsed.toRemove) {
          if (parseUniqueId(uniqueId).providerId !== params.providerId) {
            throw DataApiErrorFactory.validation({
              toRemove: [
                `'${uniqueId}' providerId does not match URL providerId '${params.providerId}'`,
              ],
            });
          }
        }
        return service.reconcileForProvider(params.providerId, parsed);
      },
    },
    '/providers/:providerId/models:resolve': {
      GET: async ({ params, query }) => {
        const parsed = ResolveProviderModelsQuerySchema.parse(query ?? {});
        return providerRegistryService.resolveModels(
          params.providerId,
          Array.isArray(parsed.ids) ? parsed.ids : [parsed.ids],
        );
      },
    },
    '/providers/:providerId/models/:modelId*/image-generation-support': {
      GET: async ({ params }) =>
        providerRegistryService.getImageGenerationSupport(params.providerId, params.modelId) ??
        null,
    },
  };
}
