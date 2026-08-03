import * as z from 'zod';

export const OpenAIModelsResponseSchema = z.object({
  data: z.array(
    z.looseObject({
      id: z.string(),
      object: z.string().optional().default('model'),
      created: z.number().optional(),
      // Not in the OpenAI spec, but OpenRouter's /models endpoints return it.
      name: z.string().optional(),
      owned_by: z.string().optional(),
    }),
  ),
  object: z.string().optional(),
});

export const GeminiModelsResponseSchema = z.object({
  models: z.array(
    z.looseObject({
      name: z.string(),
      displayName: z.string().optional(),
      description: z.string().optional(),
      version: z.string().optional(),
      baseModelId: z.string().optional(),
      inputTokenLimit: z.number().optional(),
      outputTokenLimit: z.number().optional(),
      supportedGenerationMethods: z.array(z.string()).optional(),
    }),
  ),
  nextPageToken: z.string().optional(),
});

export const TogetherModelsResponseSchema = z.array(
  z.looseObject({
    id: z.string(),
    display_name: z.string().optional(),
    organization: z.string().optional(),
    description: z.string().optional(),
    context_length: z.number().optional(),
    pricing: z
      .looseObject({
        input: z.number().optional(),
        output: z.number().optional(),
      })
      .optional(),
  }),
);

export const NewApiModelsResponseSchema = z.object({
  data: z.array(
    z.looseObject({
      id: z.string(),
      object: z.string().optional().default('model'),
      created: z.number().optional(),
      owned_by: z.string().optional(),
      supported_endpoint_types: z
        .array(z.string())
        .nullable()
        .optional()
        .transform((value) => value ?? undefined),
    }),
  ),
  object: z.string().optional(),
});

export const VercelGatewayModelsResponseSchema = z.object({
  models: z.array(
    z.looseObject({
      id: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      modelType: z.string().optional(),
      specification: z
        .looseObject({
          specificationVersion: z.string().optional(),
          provider: z.string().optional(),
          modelId: z.string().optional(),
          type: z.string().optional(),
        })
        .optional(),
    }),
  ),
});

export const AiHubMixModelsResponseSchema = z.object({
  data: z.array(
    z.looseObject({
      model_id: z.string(),
      model_name: z.string().optional(),
      developer_id: z.number().optional(),
      desc: z.string().optional(),
      pricing: z
        .looseObject({
          cache_read: z.number().optional(),
          cache_write: z.number().optional(),
          input: z.number().optional(),
          output: z.number().optional(),
        })
        .optional(),
      types: z.string().optional(),
      features: z.string().optional(),
      input_modalities: z.string().optional(),
      endpoints: z.string().optional(),
      max_output: z.number().optional(),
      context_length: z.number().optional(),
    }),
  ),
  message: z.string().optional(),
  success: z.boolean().optional(),
});
