import type {
  CanonicalParamKey,
  Currency,
  EndpointType,
  ImageGenerationMode,
  ImageGenerationSupport,
  ImageModeDef,
  Modality,
  ModelCapability,
  ReasoningEffort,
  SupportSpec,
} from '@cherrystudio/provider-registry';
import {
  CURRENCY,
  ENDPOINT_TYPE,
  MODEL_CAPABILITY,
  objectValues,
  REASONING_EFFORT,
} from '@cherrystudio/provider-registry';
import * as z from 'zod';

export type {
  CanonicalParamKey,
  Currency,
  EndpointType,
  ImageGenerationMode,
  ImageGenerationSupport,
  ImageModeDef,
  Modality,
  ModelCapability,
  ReasoningEffort,
  SupportSpec,
};
export { CURRENCY, ENDPOINT_TYPE, MODEL_CAPABILITY, objectValues, REASONING_EFFORT };

export const UNIQUE_MODEL_ID_SEPARATOR = '::';
const RESERVED_UNIQUE_MODEL_ID_ROUTE_CHARS = ['?', '#'] as const;

export type UniqueModelId = `${string}${typeof UNIQUE_MODEL_ID_SEPARATOR}${string}`;

export function isUniqueModelId(value: unknown): value is UniqueModelId {
  return typeof value === 'string' && value.includes(UNIQUE_MODEL_ID_SEPARATOR);
}

export const UniqueModelIdSchema = z.custom<UniqueModelId>(
  (value) => {
    if (typeof value !== 'string') {
      return false;
    }

    const index = value.indexOf(UNIQUE_MODEL_ID_SEPARATOR);
    if (index <= 0) {
      return false;
    }

    const modelId = value.slice(index + UNIQUE_MODEL_ID_SEPARATOR.length);
    if (modelId.length === 0) {
      return false;
    }

    return !RESERVED_UNIQUE_MODEL_ID_ROUTE_CHARS.some((char) => modelId.includes(char));
  },
  { message: `Must be a valid UniqueModelId (providerId${UNIQUE_MODEL_ID_SEPARATOR}modelId)` },
);

export function createUniqueModelId(providerId: string, modelId: string): UniqueModelId {
  if (providerId.length === 0) {
    throw new Error('providerId cannot be empty');
  }

  if (providerId.includes(UNIQUE_MODEL_ID_SEPARATOR)) {
    throw new Error(`providerId cannot contain "${UNIQUE_MODEL_ID_SEPARATOR}": ${providerId}`);
  }

  if (modelId.length === 0) {
    throw new Error('modelId cannot be empty');
  }

  const reservedChar = RESERVED_UNIQUE_MODEL_ID_ROUTE_CHARS.find((char) => modelId.includes(char));
  if (reservedChar) {
    throw new Error(
      `modelId cannot contain reserved route character "${reservedChar}": ${modelId}`,
    );
  }

  return `${providerId}${UNIQUE_MODEL_ID_SEPARATOR}${modelId}`;
}

export function parseUniqueModelId(uniqueId: UniqueModelId) {
  const index = uniqueId.indexOf(UNIQUE_MODEL_ID_SEPARATOR);
  if (index === -1) {
    throw new Error(`Invalid UniqueModelId format: ${uniqueId}`);
  }

  return {
    modelId: uniqueId.slice(index + UNIQUE_MODEL_ID_SEPARATOR.length),
    providerId: uniqueId.slice(0, index),
  };
}

export const PricePerTokenSchema = z.object({
  currency: z.enum(objectValues(CURRENCY)).default(CURRENCY.USD).optional(),
  perMillionTokens: z.number().nonnegative().nullable(),
});

export const ThinkingTokenLimitsSchema = z
  .object({
    default: z.number().nonnegative().optional(),
    max: z.number().positive().optional(),
    min: z.number().nonnegative().optional(),
  })
  .refine(
    (limits) => limits.min === undefined || limits.max === undefined || limits.min <= limits.max,
    {
      message: 'min must be less than or equal to max',
      path: ['min'],
    },
  );

const ReasoningEffortSchema = z.enum(objectValues(REASONING_EFFORT));

const ReasoningConfigSchema = z.object({
  interleaved: z.boolean().optional(),
  supportedEfforts: z.array(ReasoningEffortSchema).optional(),
  thinkingTokenLimits: ThinkingTokenLimitsSchema.optional(),
  type: z.string().regex(/^[a-z][a-z0-9-]*$/),
});
export type ReasoningConfig = z.infer<typeof ReasoningConfigSchema>;

const NumericRangeSchema = z.object({
  max: z.number(),
  min: z.number(),
});

const ParameterSupportSchema = z.object({
  frequencyPenalty: z.boolean().optional(),
  maxTokens: z.boolean().optional(),
  presencePenalty: z.boolean().optional(),
  stopSequences: z.boolean().optional(),
  systemMessage: z.boolean().optional(),
  temperature: z
    .object({ range: NumericRangeSchema.optional(), supported: z.boolean() })
    .optional(),
  topK: z.object({ range: NumericRangeSchema.optional(), supported: z.boolean() }).optional(),
  topP: z.object({ range: NumericRangeSchema.optional(), supported: z.boolean() }).optional(),
});
export type ParameterSupport = z.infer<typeof ParameterSupportSchema>;

const RuntimeModelPricingSchema = z.object({
  cacheRead: PricePerTokenSchema.optional(),
  cacheWrite: PricePerTokenSchema.optional(),
  input: PricePerTokenSchema,
  output: PricePerTokenSchema,
  perImage: z
    .object({
      price: z.number(),
      unit: z.enum(['image', 'pixel']).optional(),
    })
    .optional(),
  perMinute: z
    .object({
      price: z.number(),
      unit: z.enum(['audio', 'video']).optional(),
    })
    .optional(),
});
export type RuntimeModelPricing = z.infer<typeof RuntimeModelPricingSchema>;

export type Model = {
  apiModelId?: string;
  capabilities: ModelCapability[];
  contextWindow?: number;
  customEndpointUrl?: string;
  description?: string;
  endpointTypes?: EndpointType[];
  family?: string;
  group?: string;
  id: UniqueModelId;
  inputModalities?: Modality[];
  isDeprecated: boolean;
  isEnabled: boolean;
  isHidden: boolean;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  modelId: string;
  name: string;
  outputModalities?: Modality[];
  ownedBy?: string;
  parameters?: ParameterSupport;
  presetModelId?: string;
  pricing?: RuntimeModelPricing;
  providerId: string;
  reasoning?: ReasoningConfig;
  imageGeneration?: ImageGenerationSupport;
  replaceWith?: UniqueModelId;
  supportsStreaming: boolean;
};
