/**
 * Best-effort AI usage record entity types.
 *
 * Records are immutable per-request analytical snapshots, not financially
 * reconcilable billing events.
 */

import * as z from 'zod';

import { CURRENCY, objectValues } from './model';

const FiniteNonnegativeNumberSchema = z.number().nonnegative().refine(Number.isFinite);
const FiniteNonnegativeIntegerSchema = z.number().int().nonnegative().refine(Number.isSafeInteger);

export const AiUsageRecordKindSchema = z.enum(['invocation', 'legacy-aggregate']);
export type AiUsageRecordKind = z.infer<typeof AiUsageRecordKindSchema>;

export const AiUsageRecordMessageKindSchema = z.enum(['chat', 'agent-session']);
export type AiUsageRecordMessageKind = z.infer<typeof AiUsageRecordMessageKindSchema>;

export const AiUsageRecordCostSourceSchema = z.enum(['provider', 'computed']);
export type AiUsageRecordCostSource = z.infer<typeof AiUsageRecordCostSourceSchema>;

export const AiUsageCostBreakdownSchema = z.strictObject({
  input: FiniteNonnegativeNumberSchema.optional(),
  output: FiniteNonnegativeNumberSchema.optional(),
  cacheRead: FiniteNonnegativeNumberSchema.optional(),
  cacheWrite: FiniteNonnegativeNumberSchema.optional(),
  image: FiniteNonnegativeNumberSchema.optional(),
});
export type AiUsageCostBreakdown = z.infer<typeof AiUsageCostBreakdownSchema>;

export const AiUsagePricingSnapshotSchema = z.strictObject({
  currency: z.enum(objectValues(CURRENCY)),
  inputPerMillionTokens: FiniteNonnegativeNumberSchema.optional(),
  outputPerMillionTokens: FiniteNonnegativeNumberSchema.optional(),
  cacheReadPerMillionTokens: FiniteNonnegativeNumberSchema.optional(),
  cacheWritePerMillionTokens: FiniteNonnegativeNumberSchema.optional(),
  perImage: z
    .strictObject({
      price: FiniteNonnegativeNumberSchema,
      unit: z.enum(['image', 'pixel']),
    })
    .optional(),
  capturedAt: z.iso.datetime(),
});
export type AiUsagePricingSnapshot = z.infer<typeof AiUsagePricingSnapshotSchema>;

export const AiUsageRecordAttributionSchema = z.enum(['explicit', 'matched', 'auth', 'unknown']);
export type AiUsageRecordAttribution = z.infer<typeof AiUsageRecordAttributionSchema>;

export const AiUsageRecordAuthMethodSchema = z.enum([
  'oauth',
  'external-cli',
  'iam-aws',
  'api-key-aws',
  'iam-gcp',
  'iam-azure',
]);
export type AiUsageRecordAuthMethod = z.infer<typeof AiUsageRecordAuthMethodSchema>;

export type ServingCredentialReceipt =
  | {
      attribution: 'explicit' | 'matched';
      id: string;
      label?: string;
      masked: string;
    }
  | { attribution: 'auth'; method: AiUsageRecordAuthMethod }
  | { attribution: 'unknown' };

export const AiUsageRecordModalitySchema = z.enum(['language', 'embedding', 'image', 'rerank']);
export type AiUsageRecordModality = z.infer<typeof AiUsageRecordModalitySchema>;

export const AiUsageRecordSourceTypeSchema = z.enum(['assistant', 'agent']);
export type AiUsageRecordSourceType = z.infer<typeof AiUsageRecordSourceTypeSchema>;

export const AiUsageRecordEntrySchema = z.strictObject({
  id: z.uuidv7(),
  requestId: z.string(),
  recordKind: AiUsageRecordKindSchema,
  requestCount: z.number().int().positive(),
  messageKind: AiUsageRecordMessageKindSchema.nullable(),
  messageId: z.string().nullable(),
  providerId: z.string().nullable(),
  providerName: z.string().nullable(),
  sourceType: AiUsageRecordSourceTypeSchema.nullable(),
  sourceId: z.string().nullable(),
  sourceName: z.string().nullable(),
  sourceIcon: z.string().nullable(),
  modelId: z.string().nullable(),
  modelName: z.string().nullable(),
  modality: AiUsageRecordModalitySchema,
  apiKeyId: z.string().nullable(),
  apiKeyLabel: z.string().nullable(),
  apiKeyMasked: z.string().nullable(),
  apiKeyAttribution: AiUsageRecordAttributionSchema,
  authMethod: AiUsageRecordAuthMethodSchema.nullable(),
  inputTokens: FiniteNonnegativeIntegerSchema.nullable(),
  outputTokens: FiniteNonnegativeIntegerSchema.nullable(),
  totalTokens: FiniteNonnegativeIntegerSchema.nullable(),
  reasoningTokens: FiniteNonnegativeIntegerSchema.nullable(),
  noCacheTokens: FiniteNonnegativeIntegerSchema.nullable(),
  cacheReadTokens: FiniteNonnegativeIntegerSchema.nullable(),
  cacheWriteTokens: FiniteNonnegativeIntegerSchema.nullable(),
  imageCount: FiniteNonnegativeIntegerSchema.nullable(),
  cost: FiniteNonnegativeNumberSchema.nullable(),
  costCurrency: z.enum(objectValues(CURRENCY)).nullable(),
  costSource: AiUsageRecordCostSourceSchema.nullable(),
  costBreakdown: AiUsageCostBreakdownSchema.nullable(),
  pricingSnapshot: AiUsagePricingSnapshotSchema.nullable(),
  timeFirstTokenMs: FiniteNonnegativeIntegerSchema.nullable(),
  timeCompletionMs: FiniteNonnegativeIntegerSchema.nullable(),
  timeThinkingMs: FiniteNonnegativeIntegerSchema.nullable(),
  createdAt: z.iso.datetime(),
});
export type AiUsageRecordEntry = z.infer<typeof AiUsageRecordEntrySchema>;

type AiUsageRecordTokenFields = Pick<
  AiUsageRecordEntry,
  'inputTokens' | 'outputTokens' | 'totalTokens'
>;

export function getAiUsageRecordTotalTokens(record: AiUsageRecordTokenFields): number | null {
  if (record.totalTokens !== null) return record.totalTokens;
  if (record.inputTokens === null && record.outputTokens === null) return null;
  return (record.inputTokens ?? 0) + (record.outputTokens ?? 0);
}
