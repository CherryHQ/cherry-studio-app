import { loggerService } from '@logger';
import { eq } from 'drizzle-orm';
import type { ServingCredentialReceipt } from '@/ai/provider/credential';
import type { DbService } from '@/data/db/DbService';
import {
  type AiUsageRecordRow,
  aiUsageRecordTable,
  type InsertAiUsageRecordRow,
} from '@/data/db/schemas/aiUsageRecord';
import type {
  AiUsageCostBreakdown,
  AiUsagePricingSnapshot,
  AiUsageRecordMessageKind,
  AiUsageRecordModality,
  AiUsageRecordSourceType,
} from '@/data/types/aiUsageRecord';
import type { Currency } from '@/data/types/model';

export interface SourceSnapshot {
  type: AiUsageRecordSourceType;
  id: string;
  name: string | null;
  icon: string | null;
}

export interface MessageRef {
  kind: AiUsageRecordMessageKind;
  id: string;
}

export interface AiUsageCaptureContext {
  providerId: string;
  providerName: string | null;
  modelId: string;
  modelName: string | null;
  pricingSnapshot: AiUsagePricingSnapshot | null;
  trustProviderReportedCost: boolean;
  reportedCostCurrency: Currency | null;
  credentialReceipt: ServingCredentialReceipt;
  source: SourceSnapshot | null;
  messageRef: MessageRef | null;
}

export interface RecordAiInvocationInput {
  requestId: string;
  context: AiUsageCaptureContext;
  modality: AiUsageRecordModality;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
    noCacheTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  imageCount?: number;
  providerCost?: {
    amount: number;
    currency: Currency;
    breakdown?: AiUsageCostBreakdown;
  };
  metrics?: {
    timeFirstTokenMs?: number;
    timeCompletionMs?: number;
    timeThinkingMs?: number;
  };
  completedAt: number;
}

const PER_MILLION = 1_000_000;
const logger = loggerService.withContext('AiUsageRecordService');

function optionalCount(value: number | undefined, field: string): number | null {
  if (value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a nonnegative safe integer`);
  }
  return value;
}

function requiredTimestamp(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a nonnegative safe integer`);
  }
  return value;
}

function computeLanguageCost(
  usage: NonNullable<RecordAiInvocationInput['usage']>,
  pricing: AiUsagePricingSnapshot,
): { amount: number; breakdown: AiUsageCostBreakdown } | undefined {
  const cacheReadTokens = usage.cacheReadTokens;
  const cacheWriteTokens = usage.cacheWriteTokens;
  const hasCacheDetails = cacheReadTokens !== undefined || cacheWriteTokens !== undefined;
  const noCacheTokens =
    usage.noCacheTokens ??
    (usage.inputTokens !== undefined
      ? hasCacheDetails
        ? Math.max(0, usage.inputTokens - (cacheReadTokens ?? 0) - (cacheWriteTokens ?? 0))
        : usage.inputTokens
      : undefined);
  const buckets = [
    ['input', noCacheTokens, pricing.inputPerMillionTokens],
    [
      'cacheRead',
      cacheReadTokens,
      pricing.cacheReadPerMillionTokens ?? pricing.inputPerMillionTokens,
    ],
    [
      'cacheWrite',
      cacheWriteTokens,
      pricing.cacheWritePerMillionTokens ?? pricing.inputPerMillionTokens,
    ],
    ['output', usage.outputTokens, pricing.outputPerMillionTokens],
  ] as const;

  if (!buckets.some(([, tokens]) => tokens !== undefined)) return undefined;
  if (
    buckets.some(([, tokens, rate]) => tokens !== undefined && tokens > 0 && rate === undefined)
  ) {
    return undefined;
  }

  const breakdown: AiUsageCostBreakdown = {};
  let amount = 0;
  for (const [key, tokens, rate] of buckets) {
    if (tokens === undefined || rate === undefined) continue;
    const bucketCost = (tokens * rate) / PER_MILLION;
    breakdown[key] = bucketCost;
    amount += bucketCost;
  }
  return Number.isFinite(amount) && amount >= 0 ? { amount, breakdown } : undefined;
}

function computedCost(
  input: RecordAiInvocationInput,
): { amount: number; breakdown: AiUsageCostBreakdown } | undefined {
  const pricing = input.context.pricingSnapshot;
  if (!pricing) return undefined;
  if (input.modality === 'image') {
    if (!pricing.perImage || pricing.perImage.unit !== 'image' || input.imageCount === undefined) {
      return undefined;
    }
    const amount = input.imageCount * pricing.perImage.price;
    return { amount, breakdown: { image: amount } };
  }
  if (input.modality === 'rerank' || !input.usage) return undefined;
  return computeLanguageCost(input.usage, pricing);
}

function completeProviderBreakdown(
  amount: number,
  breakdown: AiUsageCostBreakdown | undefined,
): AiUsageCostBreakdown | null {
  if (!breakdown) return null;
  const values = Object.values(breakdown);
  if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value < 0)) {
    return null;
  }
  const sum = values.reduce((total, value) => total + value, 0);
  return Math.abs(sum - amount) <= Math.max(1e-9, Math.abs(amount) * 1e-9)
    ? structuredClone(breakdown)
    : null;
}

function invocationToRow(input: RecordAiInvocationInput): InsertAiUsageRecordRow {
  const { context, metrics, usage } = input;
  const providerCost =
    context.trustProviderReportedCost &&
    input.providerCost &&
    Number.isFinite(input.providerCost.amount) &&
    input.providerCost.amount >= 0
      ? input.providerCost
      : undefined;
  const localCost = providerCost ? undefined : computedCost(input);
  const cost = providerCost?.amount ?? localCost?.amount;
  const credential = context.credentialReceipt;

  return {
    requestId: input.requestId,
    recordKind: 'invocation',
    requestCount: 1,
    messageKind: context.messageRef?.kind ?? null,
    messageId: context.messageRef?.id ?? null,
    providerId: context.providerId,
    providerName: context.providerName,
    modelId: context.modelId,
    modelName: context.modelName,
    sourceType: context.source?.type ?? null,
    sourceId: context.source?.id ?? null,
    sourceName: context.source?.name ?? null,
    sourceIcon: context.source?.icon ?? null,
    modality: input.modality,
    apiKeyId:
      credential.attribution === 'explicit' || credential.attribution === 'matched'
        ? credential.id
        : null,
    apiKeyLabel:
      credential.attribution === 'explicit' || credential.attribution === 'matched'
        ? (credential.label ?? null)
        : null,
    apiKeyMasked:
      credential.attribution === 'explicit' || credential.attribution === 'matched'
        ? credential.masked
        : null,
    apiKeyAttribution: credential.attribution,
    authMethod: credential.attribution === 'auth' ? credential.method : null,
    inputTokens: optionalCount(usage?.inputTokens, 'inputTokens'),
    outputTokens: optionalCount(usage?.outputTokens, 'outputTokens'),
    totalTokens: optionalCount(usage?.totalTokens, 'totalTokens'),
    reasoningTokens: optionalCount(usage?.reasoningTokens, 'reasoningTokens'),
    noCacheTokens: optionalCount(usage?.noCacheTokens, 'noCacheTokens'),
    cacheReadTokens: optionalCount(usage?.cacheReadTokens, 'cacheReadTokens'),
    cacheWriteTokens: optionalCount(usage?.cacheWriteTokens, 'cacheWriteTokens'),
    imageCount:
      input.modality === 'image' ? optionalCount(input.imageCount ?? 0, 'imageCount') : null,
    cost: cost ?? null,
    costCurrency:
      providerCost?.currency ?? (localCost ? context.pricingSnapshot?.currency : null) ?? null,
    costSource: providerCost ? 'provider' : localCost ? 'computed' : null,
    costBreakdown: providerCost
      ? completeProviderBreakdown(providerCost.amount, providerCost.breakdown)
      : (localCost?.breakdown ?? null),
    pricingSnapshot: context.pricingSnapshot,
    timeFirstTokenMs: optionalCount(metrics?.timeFirstTokenMs, 'timeFirstTokenMs'),
    timeCompletionMs: optionalCount(metrics?.timeCompletionMs, 'timeCompletionMs'),
    timeThinkingMs: optionalCount(metrics?.timeThinkingMs, 'timeThinkingMs'),
    createdAt: requiredTimestamp(input.completedAt, 'completedAt'),
  };
}

export class AiUsageRecordService {
  constructor(private readonly dbService: DbService) {}

  async recordInvocation(input: RecordAiInvocationInput): Promise<void> {
    await this.recordInvocations([input]);
  }

  async recordInvocations(inputs: readonly RecordAiInvocationInput[]): Promise<void> {
    if (inputs.length === 0) return;
    try {
      const rows = inputs.map(invocationToRow);
      await this.dbService.withWriteTx(async (tx) => {
        for (const row of rows) {
          const inserted = await tx
            .insert(aiUsageRecordTable)
            .values(row)
            .onConflictDoNothing()
            .returning({ id: aiUsageRecordTable.id });
          if (inserted.length > 0) continue;

          const [existing] = await tx
            .select()
            .from(aiUsageRecordTable)
            .where(eq(aiUsageRecordTable.requestId, row.requestId))
            .limit(1);
          if (existing && !sameImmutablePayload(existing, row)) {
            logger.warn('Duplicate requestId has a different immutable payload', {
              requestId: row.requestId,
            });
          }
        }
      });
    } catch (error) {
      logger.error('Failed to record AI usage', error as Error, {
        requestIds: inputs.map(({ requestId }) => requestId),
      });
    }
  }
}

function sameImmutablePayload(
  existing: AiUsageRecordRow,
  incoming: InsertAiUsageRecordRow,
): boolean {
  const { id: _existingId, ...existingPayload } = existing;
  const { id: _incomingId, ...incomingPayload } = incoming;
  return JSON.stringify(existingPayload) === JSON.stringify(incomingPayload);
}
