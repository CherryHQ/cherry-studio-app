import * as z from 'zod';

import {
  ENDPOINT_TYPE,
  type ImageGenerationSupport,
  MODALITY,
  MODEL_CAPABILITY,
  type Model,
  objectValues,
  type ParameterSupport,
  ParameterSupportDbSchema,
  type ReasoningConfig,
  RuntimeModelPricingSchema,
  type UniqueModelId,
  UniqueModelIdSchema,
} from '@/shared/data/types/model';

export const ListModelsQuerySchema = z.object({
  capability: z.enum(objectValues(MODEL_CAPABILITY)).optional(),
  enabled: z.boolean().optional(),
  isSystemSupported: z.boolean().optional(),
  providerId: z.string().optional(),
});
export type ListModelsQuery = z.infer<typeof ListModelsQuerySchema>;
export type ModelListQuery = Omit<ListModelsQuery, 'isSystemSupported'>;

export const CreateModelSchema = z.strictObject({
  capabilities: z.array(z.enum(objectValues(MODEL_CAPABILITY))).optional(),
  contextWindow: z.number().int().positive().optional(),
  description: z.string().optional(),
  endpointTypes: z.array(z.enum(objectValues(ENDPOINT_TYPE))).optional(),
  group: z.string().optional(),
  inputModalities: z.array(z.enum(objectValues(MODALITY))).optional(),
  maxInputTokens: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  modelId: z.string().min(1),
  name: z.string().optional(),
  outputModalities: z.array(z.enum(objectValues(MODALITY))).optional(),
  parameterSupport: ParameterSupportDbSchema.optional(),
  presetModelId: z.string().optional(),
  pricing: RuntimeModelPricingSchema.optional(),
  providerId: z.string().min(1),
  supportsStreaming: z.boolean().optional(),
});
export type CreateModelDto = z.infer<typeof CreateModelSchema>;

export const MODELS_BATCH_MAX_ITEMS = 500;
export const MODELS_BULK_UPDATE_MAX_ITEMS = 1000;
export const MODELS_DELETE_MAX_IDS = 1000;
export const MODELS_RECONCILE_MAX_ITEMS = 5000;

export const CreateModelsSchema = z.array(CreateModelSchema).min(1).max(MODELS_BATCH_MAX_ITEMS);
export type CreateModelsDto = z.infer<typeof CreateModelsSchema>;

export const UpdateModelSchema = CreateModelSchema.omit({
  modelId: true,
  presetModelId: true,
  providerId: true,
})
  .partial()
  .extend({
    isDeprecated: z.boolean().optional(),
    isEnabled: z.boolean().optional(),
    isHidden: z.boolean().optional(),
    notes: z.string().optional(),
  });
export type UpdateModelDto = z.infer<typeof UpdateModelSchema>;

export const BulkUpdateModelItemSchema = z.object({
  patch: UpdateModelSchema,
  uniqueModelId: UniqueModelIdSchema,
});
export type BulkUpdateModelItem = z.infer<typeof BulkUpdateModelItemSchema>;

export const BulkUpdateModelsSchema = z
  .array(BulkUpdateModelItemSchema)
  .min(1)
  .max(MODELS_BULK_UPDATE_MAX_ITEMS);
export type BulkUpdateModelsDto = z.infer<typeof BulkUpdateModelsSchema>;

const DeleteModelsIdsQueryValueSchema = z.union([
  UniqueModelIdSchema.transform((id) => [id]),
  z.array(UniqueModelIdSchema).min(1).max(MODELS_DELETE_MAX_IDS),
]);

export const DeleteModelsQuerySchema = z.strictObject({
  ids: DeleteModelsIdsQueryValueSchema,
});
export type DeleteModelsQuery = z.input<typeof DeleteModelsQuerySchema>;

export const ReconcileProviderModelsSchema = z.strictObject({
  toAdd: z.array(CreateModelSchema).max(MODELS_RECONCILE_MAX_ITEMS),
  toRemove: z.array(UniqueModelIdSchema).max(MODELS_RECONCILE_MAX_ITEMS),
});
export type ReconcileProviderModelsDto = z.infer<typeof ReconcileProviderModelsSchema>;

export const ResolveProviderModelsQuerySchema = z.strictObject({
  ids: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
});
export type ResolveProviderModelsQuery = z.infer<typeof ResolveProviderModelsQuerySchema>;

/** Mobile workflow input retained for the higher-level provider pull adapter. */
export type AddModelInput = Omit<CreateModelDto, 'presetModelId'> & {
  isDeprecated?: boolean;
  isEnabled?: boolean;
  isHidden?: boolean;
  ownedBy?: string | null;
  parameters?: ParameterSupport | null;
  presetModelId?: string;
  reasoning?: ReasoningConfig | null;
};

export type ModelSchemas = {
  '/models': {
    DELETE: {
      query: DeleteModelsQuery;
      response: undefined;
    };
    GET: {
      query: ListModelsQuery;
      response: Model[];
    };
    PATCH: {
      body: BulkUpdateModelsDto;
      response: Model[];
    };
    POST: {
      body: CreateModelsDto;
      response: Model[];
    };
  };
  '/models/:uniqueModelId*': {
    DELETE: {
      params: { uniqueModelId: UniqueModelId };
      response: undefined;
    };
    GET: {
      params: { uniqueModelId: UniqueModelId };
      response: Model;
    };
    PATCH: {
      body: UpdateModelDto;
      params: { uniqueModelId: UniqueModelId };
      response: Model;
    };
  };
  '/providers/:providerId/models:reconcile': {
    POST: {
      body: ReconcileProviderModelsDto;
      params: { providerId: string };
      response: Model[];
    };
  };
  '/providers/:providerId/models:resolve': {
    GET: {
      params: { providerId: string };
      query: ResolveProviderModelsQuery;
      response: Model[];
    };
  };
  '/providers/:providerId/models/:modelId*/image-generation-support': {
    GET: {
      params: { modelId: string; providerId: string };
      response: ImageGenerationSupport | null;
    };
  };
};
