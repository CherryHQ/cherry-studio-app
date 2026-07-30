import { loggerService } from '@logger';
import { and, eq } from 'drizzle-orm';
import type { ServingCredentialReceipt } from '@/ai/provider/credential';
import type { Database, DbService } from '@/data/db/DbService';
import {
  type AiUsageRecordRow,
  aiUsageRecordTable,
  type InsertAiUsageRecordRow,
} from '@/data/db/schemas/aiUsageRecord';
import { messageTable } from '@/data/db/schemas/message';
import type {
  AiUsageCostBreakdown,
  AiUsagePricingSnapshot,
  AiUsageRecordMessageKind,
  AiUsageRecordModality,
  AiUsageRecordSourceType,
} from '@/data/types/aiUsageRecord';
import type { MessageStats } from '@/data/types/message';
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

export type MessageUsageProjection = Pick<
  MessageStats,
  | 'inputTokens'
  | 'outputTokens'
  | 'totalTokens'
  | 'inputTokenDetails'
  | 'outputTokenDetails'
  | 'requestCount'
  | 'estimatedRequestCount'
  | 'unpricedRequestCount'
  | 'costs'
  | 'providerPerformance'
>;

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

const usageProjectionKeys = [
  'inputTokens',
  'outputTokens',
  'totalTokens',
  'inputTokenDetails',
  'outputTokenDetails',
  'requestCount',
  'estimatedRequestCount',
  'unpricedRequestCount',
  'costs',
  'providerPerformance',
] as const satisfies readonly (keyof MessageUsageProjection)[];

const legacyUsageKeys = [
  'cacheReadTokens',
  'cacheWriteTokens',
  'completionTokens',
  'cost',
  'noCacheTokens',
  'promptTokens',
  'thoughtsTokens',
] as const;

export function mergeMessageUsageProjection(
  existing: MessageStats | null | undefined,
  projection: MessageUsageProjection,
): MessageStats {
  const messageOwned = { ...(existing ?? {}) } as MessageStats & Record<string, unknown>;
  for (const key of usageProjectionKeys) delete messageOwned[key];
  for (const key of legacyUsageKeys) delete messageOwned[key];
  return { ...messageOwned, ...projection };
}

function sumOptional(
  rows: readonly AiUsageRecordRow[],
  read: (row: AiUsageRecordRow) => number | null,
): number | undefined {
  let sawValue = false;
  let total = 0;
  for (const row of rows) {
    const value = read(row);
    if (value === null) continue;
    sawValue = true;
    total += value;
  }
  return sawValue ? total : undefined;
}

async function getMessageUsageProjectionTx(
  db: Database,
  ref: MessageRef,
): Promise<MessageUsageProjection> {
  const rows = await db
    .select()
    .from(aiUsageRecordTable)
    .where(
      and(eq(aiUsageRecordTable.messageKind, ref.kind), eq(aiUsageRecordTable.messageId, ref.id)),
    );
  const inputTokens = sumOptional(rows, (row) => row.inputTokens);
  const outputTokens = sumOptional(rows, (row) => row.outputTokens);
  const totalTokens = sumOptional(
    rows,
    (row) =>
      row.totalTokens ??
      (row.inputTokens !== null || row.outputTokens !== null
        ? (row.inputTokens ?? 0) + (row.outputTokens ?? 0)
        : null),
  );
  const noCacheTokens = sumOptional(rows, (row) => row.noCacheTokens);
  const cacheReadTokens = sumOptional(rows, (row) => row.cacheReadTokens);
  const cacheWriteTokens = sumOptional(rows, (row) => row.cacheWriteTokens);
  const reasoningTokens = sumOptional(rows, (row) => row.reasoningTokens);
  const textTokens = sumOptional(rows, (row) =>
    row.outputTokens !== null ? Math.max(0, row.outputTokens - (row.reasoningTokens ?? 0)) : null,
  );
  let measuredOutputTokens = 0;
  let generationDurationMs = 0;
  let measuredInvocationCount = 0;
  const costs = new Map<
    Currency,
    {
      currency: Currency;
      amount: number;
      providerReportedRequestCount: number;
      computedRequestCount: number;
    }
  >();

  for (const row of rows) {
    if (row.outputTokens !== null && row.timeCompletionMs !== null && row.timeCompletionMs > 0) {
      const duration =
        row.timeFirstTokenMs !== null && row.timeFirstTokenMs < row.timeCompletionMs
          ? row.timeCompletionMs - row.timeFirstTokenMs
          : row.timeCompletionMs;
      if (duration > 0) {
        measuredOutputTokens += row.outputTokens;
        generationDurationMs += duration;
        measuredInvocationCount += 1;
      }
    }

    if (row.cost === null || row.costCurrency === null || row.costSource === null) continue;
    const bucket = costs.get(row.costCurrency) ?? {
      currency: row.costCurrency,
      amount: 0,
      providerReportedRequestCount: 0,
      computedRequestCount: 0,
    };
    bucket.amount += row.cost;
    if (row.costSource === 'provider') bucket.providerReportedRequestCount += row.requestCount;
    else bucket.computedRequestCount += row.requestCount;
    costs.set(row.costCurrency, bucket);
  }

  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    ...(noCacheTokens !== undefined ||
    cacheReadTokens !== undefined ||
    cacheWriteTokens !== undefined
      ? {
          inputTokenDetails: {
            ...(noCacheTokens !== undefined ? { noCacheTokens } : {}),
            ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
            ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
          },
        }
      : {}),
    ...(textTokens !== undefined || reasoningTokens !== undefined
      ? {
          outputTokenDetails: {
            ...(textTokens !== undefined ? { textTokens } : {}),
            ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
          },
        }
      : {}),
    requestCount: rows.reduce((sum, row) => sum + row.requestCount, 0),
    estimatedRequestCount: rows.reduce(
      (sum, row) => sum + (row.recordKind === 'legacy-aggregate' ? row.requestCount : 0),
      0,
    ),
    unpricedRequestCount: rows.reduce(
      (sum, row) => sum + (row.cost === null ? row.requestCount : 0),
      0,
    ),
    costs: [...costs.values()].sort((left, right) => left.currency.localeCompare(right.currency)),
    ...(measuredInvocationCount > 0
      ? { providerPerformance: { measuredOutputTokens, generationDurationMs } }
      : {}),
  };
}

async function rebuildMessageUsageProjectionTx(db: Database, ref: MessageRef): Promise<void> {
  if (ref.kind !== 'chat') return;
  const [row] = await db
    .select({ stats: messageTable.stats })
    .from(messageTable)
    .where(eq(messageTable.id, ref.id))
    .limit(1);
  if (!row) return;
  const projection = await getMessageUsageProjectionTx(db, ref);
  const nextStats = mergeMessageUsageProjection(row.stats, projection);
  if (JSON.stringify(row.stats) === JSON.stringify(nextStats)) return;
  await db.update(messageTable).set({ stats: nextStats }).where(eq(messageTable.id, ref.id));
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
        const affectedMessages = new Map<string, MessageRef>();
        for (const row of rows) {
          if (row.messageKind && row.messageId) {
            const ref = { kind: row.messageKind, id: row.messageId };
            affectedMessages.set(`${ref.kind}:${ref.id}`, ref);
          }
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
        for (const ref of affectedMessages.values()) {
          await rebuildMessageUsageProjectionTx(tx, ref);
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
