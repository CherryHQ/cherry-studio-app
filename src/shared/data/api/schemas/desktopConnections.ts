import * as z from 'zod';

import type { DesktopConnection } from '@/shared/data/types/desktopConnection';
import {
  ENDPOINT_TYPE,
  MODALITY,
  MODEL_CAPABILITY,
  objectValues,
  ReasoningConfigSchema,
  RuntimeModelPricingSchema,
} from '@/shared/data/types/model';

function isIpAddress(value: string): boolean {
  if (value.includes(':')) {
    try {
      return new URL(`http://[${value}]`).hostname.startsWith('[');
    } catch {
      return false;
    }
  }

  const octets = value.split('.');
  return (
    octets.length === 4 && octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)
  );
}

export const DesktopPairingQrSchema = z.object({
  code: z.string().regex(/^[a-f\d]{32}$/i),
  ips: z.array(z.string().refine(isIpAddress, 'Invalid IP address')).min(1),
  name: z.string().min(1).max(128),
  port: z.number().int().min(1).max(65_535),
  t: z.literal('cherry-studio-pair'),
  v: z.literal(1),
});
export type DesktopPairingQr = z.infer<typeof DesktopPairingQrSchema>;

export const PairDesktopConnectionSchema = DesktopPairingQrSchema.extend({
  connectionId: z.string().uuid().optional(),
});
export type PairDesktopConnectionDto = z.infer<typeof PairDesktopConnectionSchema>;

const ApiKeySchema = z.looseObject({
  id: z.string().min(1),
  isEnabled: z.boolean(),
  key: z.string().min(1),
  label: z.string().optional(),
});

const AuthConfigSchema = z.discriminatedUnion('type', [
  z.looseObject({
    headerName: z.string().optional(),
    prefix: z.string().optional(),
    required: z.boolean().optional(),
    type: z.literal('api-key'),
  }),
  z.looseObject({
    accessKeyId: z.string().optional(),
    region: z.string(),
    secretAccessKey: z.string().optional(),
    type: z.literal('iam-aws'),
  }),
  z.looseObject({ region: z.string(), type: z.literal('api-key-aws') }),
  z.looseObject({
    credentials: z.record(z.string(), z.unknown()).optional(),
    location: z.string(),
    project: z.string(),
    type: z.literal('iam-gcp'),
  }),
  z.looseObject({
    apiVersion: z.string(),
    deploymentId: z.string().optional(),
    type: z.literal('iam-azure'),
  }),
]);

const DesktopAuthTypeSchema = z.enum([
  'api-key',
  'oauth',
  'iam-aws',
  'api-key-aws',
  'iam-gcp',
  'iam-azure',
]);

const EndpointConfigSchema = z.looseObject({
  adapterFamily: z.string().optional(),
  baseUrl: z.string().optional(),
  modelsApiUrls: z
    .looseObject({
      default: z.string().optional(),
      embedding: z.string().optional(),
      image: z.string().optional(),
      reranker: z.string().optional(),
    })
    .optional(),
  reasoningFormatType: z.string().optional(),
});

const ProviderSettingsSchema = z.looseObject({
  apiVersion: z.string().optional(),
  cacheControl: z
    .looseObject({
      cacheLastNMessages: z.number().optional(),
      cacheSystemMessage: z.boolean().optional(),
      enabled: z.boolean(),
      tokenThreshold: z.number().optional(),
    })
    .optional(),
  extraHeaders: z.record(z.string(), z.string()).optional(),
  isAuthed: z.boolean().optional(),
  keepAliveTime: z.number().optional(),
  notes: z.string().optional(),
  rateLimit: z.number().optional(),
  serviceTier: z.string().nullable().optional(),
  streamOptions: z.looseObject({ includeUsage: z.boolean().optional() }).optional(),
  summaryText: z.enum(['auto', 'concise', 'detailed']).nullable().optional(),
  timeout: z.number().optional(),
  verbosity: z.string().nullable().optional(),
});

const ProviderIdSchema = z
  .string()
  .min(1)
  .refine((value) => !value.includes('::'), 'Provider ID cannot contain "::"');
const RawModelIdSchema = z
  .string()
  .min(1)
  .refine((value) => !value.includes('?') && !value.includes('#'), 'Invalid model ID');

const DesktopParameterSupportSchema = z.looseObject({
  frequencyPenalty: z.boolean().optional(),
  maxTokens: z.boolean().optional(),
  presencePenalty: z.boolean().optional(),
  stopSequences: z.boolean().optional(),
  systemMessage: z.boolean().optional(),
  temperature: z
    .looseObject({ max: z.number().optional(), min: z.number().optional(), supported: z.boolean() })
    .optional(),
  topK: z
    .looseObject({ max: z.number().optional(), min: z.number().optional(), supported: z.boolean() })
    .optional(),
  topP: z
    .looseObject({ max: z.number().optional(), min: z.number().optional(), supported: z.boolean() })
    .optional(),
});

function mapParameterRange(value: { max?: number; min?: number; supported: boolean }) {
  return {
    supported: value.supported,
    ...(value.min !== undefined && value.max !== undefined
      ? { range: { max: value.max, min: value.min } }
      : {}),
  };
}

function mapParameterSupport(value: z.infer<typeof DesktopParameterSupportSchema>) {
  const { temperature, topK, topP, ...flags } = value;
  return {
    ...flags,
    ...(temperature ? { temperature: mapParameterRange(temperature) } : {}),
    ...(topK ? { topK: mapParameterRange(topK) } : {}),
    ...(topP ? { topP: mapParameterRange(topP) } : {}),
  };
}

export const DesktopProviderModelSchema = z
  .looseObject({
    apiModelId: RawModelIdSchema,
    capabilities: z.array(z.enum(objectValues(MODEL_CAPABILITY))).optional(),
    contextWindow: z.number().int().positive().optional(),
    description: z.string().optional(),
    endpointTypes: z.array(z.enum(objectValues(ENDPOINT_TYPE))).optional(),
    group: z.string().optional(),
    id: z.string().min(1),
    inputModalities: z.array(z.enum(objectValues(MODALITY))).optional(),
    isDeprecated: z.boolean().optional(),
    isHidden: z.boolean().optional(),
    maxInputTokens: z.number().int().positive().optional(),
    maxOutputTokens: z.number().int().positive().optional(),
    name: z.string().optional(),
    outputModalities: z.array(z.enum(objectValues(MODALITY))).optional(),
    parameterSupport: DesktopParameterSupportSchema.optional(),
    presetModelId: RawModelIdSchema.nullable().optional(),
    pricing: RuntimeModelPricingSchema.optional(),
    providerId: ProviderIdSchema,
    reasoning: ReasoningConfigSchema.optional(),
    supportsStreaming: z.boolean().optional(),
  })
  .transform(({ apiModelId, parameterSupport, ...model }) => ({
    ...model,
    modelId: apiModelId,
    ...(parameterSupport ? { parameters: mapParameterSupport(parameterSupport) } : {}),
  }));
export type DesktopProviderModel = z.infer<typeof DesktopProviderModelSchema>;

export const DesktopProviderSnapshotSchema = z
  .looseObject({
    apiFeatures: z
      .looseObject({
        arrayContent: z.boolean().optional(),
        reportsActualCost: z.boolean().optional(),
        serviceTier: z.boolean().optional(),
        streamOptions: z.boolean().optional(),
        verbosity: z.boolean().optional(),
      })
      .optional(),
    apiHost: z.string().optional(),
    apiKeys: z.array(ApiKeySchema).default([]),
    authConfig: z.unknown().optional(),
    authMethods: z.array(z.enum(['api-key', 'oauth', 'external-cli'])).optional(),
    authOptional: z.boolean().optional(),
    authType: DesktopAuthTypeSchema.optional(),
    defaultChatEndpoint: z.enum(objectValues(ENDPOINT_TYPE)).optional(),
    endpointConfigs: z
      .partialRecord(z.enum(objectValues(ENDPOINT_TYPE)), EndpointConfigSchema)
      .optional(),
    id: ProviderIdSchema,
    models: z.array(DesktopProviderModelSchema),
    name: z.string().min(1),
    presetProviderId: ProviderIdSchema.optional(),
    providerSettings: ProviderSettingsSchema.optional(),
    reportsActualCost: z.boolean().optional(),
    settings: ProviderSettingsSchema.optional(),
    type: z.string().optional(),
  })
  .superRefine((provider, context) => {
    const modelIds = new Set<string>();
    for (const model of provider.models) {
      if (modelIds.has(model.modelId)) {
        context.addIssue({ code: 'custom', message: 'Duplicate model ID', path: ['models'] });
      }
      modelIds.add(model.modelId);
    }
  });
export type DesktopProviderSnapshot = z.infer<typeof DesktopProviderSnapshotSchema>;

export const DesktopProvidersSnapshotSchema = z
  .looseObject({
    providers: z.array(DesktopProviderSnapshotSchema),
    version: z.number().int(),
  })
  .superRefine((snapshot, context) => {
    const providerIds = new Set<string>();
    for (const provider of snapshot.providers) {
      if (providerIds.has(provider.id)) {
        context.addIssue({ code: 'custom', message: 'Duplicate provider ID', path: ['providers'] });
      }
      providerIds.add(provider.id);
    }
  });
export type DesktopProvidersSnapshot = z.infer<typeof DesktopProvidersSnapshotSchema>;

export function parseSupportedAuthConfig(value: unknown) {
  const parsed = AuthConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export type DesktopImportMode = 'provider' | 'provider-models';
export type DesktopImportUnavailableReason = 'unsupported-auth';

export const DesktopImportSelectionsSchema = z.strictObject({
  selections: z
    .array(
      z.strictObject({
        mode: z.enum(['provider', 'provider-models']),
        providerId: z.string().min(1),
      }),
    )
    .min(1),
});
export type DesktopImportSelectionsDto = z.infer<typeof DesktopImportSelectionsSchema>;

export type DesktopImportPreview = {
  providers: {
    action: 'add' | 'update';
    id: string;
    models: { action: 'add' | 'update'; modelId: string; name: string }[];
    name: string;
    unavailableReason?: DesktopImportUnavailableReason;
  }[];
};

export type DesktopImportResult = {
  modelsAdded: number;
  modelsUpdated: number;
  providersAdded: number;
  providersUpdated: number;
};

export type DesktopConnectionSchemas = {
  '/desktop-connections': {
    GET: { response: { items: DesktopConnection[]; total: number } };
    POST: { body: PairDesktopConnectionDto; response: DesktopConnection };
  };
  '/desktop-connections/:id': {
    DELETE: { params: { id: string }; response: undefined };
    GET: { params: { id: string }; response: DesktopConnection };
  };
  '/desktop-connections/:id/import': {
    POST: {
      body: DesktopImportSelectionsDto;
      params: { id: string };
      response: DesktopImportResult;
    };
  };
  '/desktop-connections/:id/preview': {
    POST: { params: { id: string }; response: DesktopImportPreview };
  };
};
