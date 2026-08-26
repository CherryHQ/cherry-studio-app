import { loggerService } from '@logger';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  type SQL,
  type SQLWrapper,
  sql,
} from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

import { application } from '@/backend/core/application/Application';
import type { Database } from '@/backend/data/db/DbService';
import {
  type AiUsageRecordRow,
  aiUsageRecordTable,
  type InsertAiUsageRecordRow,
} from '@/backend/data/db/schemas/aiUsageRecord';
import type {
  AiUsageRecordGroupBy,
  AiUsageRecordListQuery,
  AiUsageRecordListQueryParams,
  AiUsageRecordListResponse,
  AiUsageRecordMetric,
  AiUsageRecordStatsBucket,
  AiUsageRecordStatsGroupIdentity,
  AiUsageRecordStatsMetrics,
  AiUsageRecordStatsQuery,
  AiUsageRecordStatsQueryParams,
  AiUsageRecordStatsResponse,
  AiUsageRecordTimelineBucket,
  AiUsageRecordTimelineQuery,
  AiUsageRecordTimelineQueryParams,
  AiUsageRecordTimelineResponse,
} from '@/shared/data/api/schemas/aiUsageRecords';
import {
  AiUsageRecordListQuerySchema,
  AiUsageRecordStatsQuerySchema,
  AiUsageRecordTimelineQuerySchema,
} from '@/shared/data/api/schemas/aiUsageRecords';
import type {
  AiUsageCostBreakdown,
  AiUsagePricingSnapshot,
  AiUsageRecordAttribution,
  AiUsageRecordEntry,
  AiUsageRecordMessageKind,
  AiUsageRecordModality,
  AiUsageRecordSourceType,
  ServingCredentialReceipt,
} from '@/shared/data/types/aiUsageRecord';
import { getAiUsageRecordTotalTokens } from '@/shared/data/types/aiUsageRecord';
import type { Currency } from '@/shared/data/types/model';

import { timestampToISO } from './utils/rowMappers';

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

type GroupDimension = AiUsageRecordGroupBy | undefined;
type ListSortBy = AiUsageRecordListQuery['sortBy'];
type ListSortOrder = AiUsageRecordListQuery['sortOrder'];
type MetricCursor = { value: number | null; createdAt: number; id: string };

function rowToRecord(row: AiUsageRecordRow): AiUsageRecordEntry {
  return {
    ...row,
    createdAt: timestampToISO(row.createdAt),
  };
}

function totalTokensValue(): SQL<number | null> {
  return sql<number | null>`CASE
    WHEN ${aiUsageRecordTable.totalTokens} IS NOT NULL THEN ${aiUsageRecordTable.totalTokens}
    WHEN ${aiUsageRecordTable.inputTokens} IS NOT NULL OR ${aiUsageRecordTable.outputTokens} IS NOT NULL
      THEN coalesce(${aiUsageRecordTable.inputTokens}, 0) + coalesce(${aiUsageRecordTable.outputTokens}, 0)
    ELSE NULL
  END`;
}

function tokensPerSecondValue(): SQL<number | null> {
  return sql<number | null>`CASE
    WHEN ${aiUsageRecordTable.outputTokens} IS NULL
      OR ${aiUsageRecordTable.outputTokens} <= 0
      OR ${aiUsageRecordTable.timeCompletionMs} IS NULL
      OR ${aiUsageRecordTable.timeCompletionMs} <= 0
    THEN NULL
    ELSE ${aiUsageRecordTable.outputTokens} / (
      (CASE
        WHEN ${aiUsageRecordTable.timeFirstTokenMs} IS NOT NULL
          AND ${aiUsageRecordTable.timeFirstTokenMs} < ${aiUsageRecordTable.timeCompletionMs}
        THEN ${aiUsageRecordTable.timeCompletionMs} - ${aiUsageRecordTable.timeFirstTokenMs}
        ELSE ${aiUsageRecordTable.timeCompletionMs}
      END) / 1000.0
    )
  END`;
}

function getTokensPerSecond(row: AiUsageRecordRow): number | null {
  if (
    row.outputTokens === null ||
    row.outputTokens <= 0 ||
    row.timeCompletionMs === null ||
    row.timeCompletionMs <= 0
  ) {
    return null;
  }
  const generationMs =
    row.timeFirstTokenMs !== null && row.timeFirstTokenMs < row.timeCompletionMs
      ? row.timeCompletionMs - row.timeFirstTokenMs
      : row.timeCompletionMs;
  return row.outputTokens / (generationMs / 1000);
}

function getListSortValue(row: AiUsageRecordRow, sortBy: ListSortBy): number | null {
  switch (sortBy) {
    case 'createdAt':
      return row.createdAt;
    case 'totalTokens':
      return getAiUsageRecordTotalTokens(row);
    case 'cost':
      return row.cost;
    case 'timeFirstTokenMs':
      return row.timeFirstTokenMs;
    case 'tokensPerSecond':
      return getTokensPerSecond(row);
  }
}

function encodeCursor(cursor: MetricCursor): string {
  return encodeURIComponent(JSON.stringify([cursor.value, cursor.createdAt, cursor.id]));
}

function decodeCursor(raw: string | undefined): MetricCursor | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    if (!Array.isArray(parsed) || parsed.length !== 3) return null;
    const [value, createdAt, id] = parsed;
    if (
      (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) ||
      typeof createdAt !== 'number' ||
      !Number.isFinite(createdAt) ||
      typeof id !== 'string' ||
      id.length === 0
    ) {
      return null;
    }
    return { value, createdAt, id };
  } catch {
    return null;
  }
}

function requiredCondition(condition: SQL | undefined): SQL {
  if (!condition) throw new Error('Expected a non-empty SQL condition');
  return condition;
}

function cursorWhere(
  sortExpression: SQLWrapper,
  sortOrder: ListSortOrder,
  cursor: MetricCursor,
): SQL {
  const afterTie = requiredCondition(
    or(
      lt(aiUsageRecordTable.createdAt, cursor.createdAt),
      and(eq(aiUsageRecordTable.createdAt, cursor.createdAt), gt(aiUsageRecordTable.id, cursor.id)),
    ),
  );
  if (cursor.value === null) {
    return requiredCondition(and(isNull(sortExpression), afterTie));
  }
  const afterMetric =
    sortOrder === 'asc' ? gt(sortExpression, cursor.value) : lt(sortExpression, cursor.value);
  return requiredCondition(
    or(
      isNull(sortExpression),
      and(
        isNotNull(sortExpression),
        or(afterMetric, and(eq(sortExpression, cursor.value), afterTie)),
      ),
    ),
  );
}

async function listAiUsageRecords(
  db: Database,
  query: AiUsageRecordListQuery,
): Promise<AiUsageRecordListResponse> {
  const filterConditions: SQL[] = [];
  if (query.from !== undefined)
    filterConditions.push(gte(aiUsageRecordTable.createdAt, query.from));
  if (query.to !== undefined) filterConditions.push(lte(aiUsageRecordTable.createdAt, query.to));
  if (query.messageKind !== undefined && query.messageId !== undefined) {
    filterConditions.push(
      eq(aiUsageRecordTable.messageKind, query.messageKind),
      eq(aiUsageRecordTable.messageId, query.messageId),
    );
  }
  if (query.sortBy === 'cost' && query.costCurrency) {
    filterConditions.push(eq(aiUsageRecordTable.costCurrency, query.costCurrency));
  }
  const filterWhere = filterConditions.length > 0 ? and(...filterConditions) : undefined;
  const sortExpression =
    query.sortBy === 'totalTokens'
      ? totalTokensValue()
      : query.sortBy === 'cost'
        ? aiUsageRecordTable.cost
        : query.sortBy === 'timeFirstTokenMs'
          ? aiUsageRecordTable.timeFirstTokenMs
          : query.sortBy === 'tokensPerSecond'
            ? tokensPerSecondValue()
            : aiUsageRecordTable.createdAt;
  const conditions = [...filterConditions];
  const cursor = decodeCursor(query.cursor);
  if (cursor) conditions.push(cursorWhere(sortExpression, query.sortOrder, cursor));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const orderExpression = query.sortOrder === 'asc' ? asc(sortExpression) : desc(sortExpression);
  const rows = await db
    .select()
    .from(aiUsageRecordTable)
    .where(where)
    .orderBy(
      sql`${sortExpression} IS NULL`,
      orderExpression,
      desc(aiUsageRecordTable.createdAt),
      asc(aiUsageRecordTable.id),
    )
    .limit(query.limit + 1);
  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(aiUsageRecordTable)
    .where(filterWhere);
  const pageRows = rows.slice(0, query.limit);
  const tail = pageRows.at(-1);
  return {
    items: pageRows.map(rowToRecord),
    total: countRow?.count ?? 0,
    ...(rows.length > query.limit && tail
      ? {
          nextCursor: encodeCursor({
            value: getListSortValue(tail, query.sortBy),
            createdAt: tail.createdAt,
            id: tail.id,
          }),
        }
      : {}),
  };
}

function groupIdentityColumns(groupBy: GroupDimension): AnySQLiteColumn[] {
  switch (groupBy) {
    case 'provider':
      return [aiUsageRecordTable.providerId];
    case 'apiKey':
      return [
        aiUsageRecordTable.providerId,
        aiUsageRecordTable.apiKeyId,
        aiUsageRecordTable.apiKeyAttribution,
        aiUsageRecordTable.authMethod,
      ];
    case 'model':
      return [aiUsageRecordTable.providerId, aiUsageRecordTable.modelId];
    case 'source':
      return [aiUsageRecordTable.sourceType, aiUsageRecordTable.sourceId];
    default:
      return [];
  }
}

function groupIdentitySelect(groupBy: GroupDimension) {
  const bySource = groupBy === 'source';
  const byProvider = groupBy !== undefined && !bySource;
  const byApiKey = groupBy === 'apiKey';
  return {
    providerId: byProvider
      ? aiUsageRecordTable.providerId
      : sql<string | null>`NULL`.as('provider_id'),
    providerName: byProvider
      ? sql<string | null>`max(${aiUsageRecordTable.providerName})`.as('provider_name')
      : sql<string | null>`NULL`.as('provider_name'),
    sourceType: bySource
      ? aiUsageRecordTable.sourceType
      : sql<AiUsageRecordSourceType | null>`NULL`.as('source_type'),
    sourceId: bySource ? aiUsageRecordTable.sourceId : sql<string | null>`NULL`.as('source_id'),
    sourceName: bySource
      ? sql<string | null>`max(${aiUsageRecordTable.sourceName})`.as('source_name')
      : sql<string | null>`NULL`.as('source_name'),
    sourceIcon: bySource
      ? sql<string | null>`max(${aiUsageRecordTable.sourceIcon})`.as('source_icon')
      : sql<string | null>`NULL`.as('source_icon'),
    apiKeyId: byApiKey ? aiUsageRecordTable.apiKeyId : sql<string | null>`NULL`.as('api_key_id'),
    apiKeyLabel: byApiKey
      ? sql<string | null>`max(${aiUsageRecordTable.apiKeyLabel})`.as('api_key_label')
      : sql<string | null>`NULL`.as('api_key_label'),
    apiKeyMasked: byApiKey
      ? sql<string | null>`max(${aiUsageRecordTable.apiKeyMasked})`.as('api_key_masked')
      : sql<string | null>`NULL`.as('api_key_masked'),
    apiKeyAttribution: byApiKey
      ? aiUsageRecordTable.apiKeyAttribution
      : sql<string | null>`NULL`.as('api_key_attribution'),
    authMethod: byApiKey
      ? aiUsageRecordTable.authMethod
      : sql<string | null>`NULL`.as('auth_method'),
    modelId:
      groupBy === 'model' ? aiUsageRecordTable.modelId : sql<string | null>`NULL`.as('model_id'),
  };
}

type GroupIdentityRow = {
  [Key in keyof ReturnType<typeof groupIdentitySelect>]: string | null;
};

function toGroupIdentity(
  row: GroupIdentityRow,
  groupBy: GroupDimension,
): Omit<AiUsageRecordTimelineBucket, 'date' | keyof AiUsageRecordStatsMetrics> {
  if (!groupBy) return {};
  return {
    ...(groupBy === 'source'
      ? {
          sourceType: row.sourceType as AiUsageRecordSourceType | null,
          sourceId: row.sourceId,
          sourceName: row.sourceName,
          sourceIcon: row.sourceIcon,
        }
      : { providerId: row.providerId, providerName: row.providerName }),
    ...(groupBy === 'apiKey'
      ? {
          apiKeyId: row.apiKeyId,
          apiKeyLabel: row.apiKeyLabel,
          apiKeyMasked: row.apiKeyMasked,
          apiKeyAttribution: row.apiKeyAttribution as AiUsageRecordAttribution,
          authMethod: row.authMethod as AiUsageRecordEntry['authMethod'],
        }
      : {}),
    ...(groupBy === 'model' ? { modelId: row.modelId } : {}),
  };
}

function toStatsGroupIdentity(
  row: GroupIdentityRow,
  groupBy: AiUsageRecordGroupBy,
): AiUsageRecordStatsGroupIdentity {
  switch (groupBy) {
    case 'provider':
      return { groupBy, providerId: row.providerId, providerName: row.providerName };
    case 'model':
      return {
        groupBy,
        providerId: row.providerId,
        providerName: row.providerName,
        modelId: row.modelId,
      };
    case 'source':
      return {
        groupBy,
        sourceType: row.sourceType as AiUsageRecordSourceType | null,
        sourceId: row.sourceId,
        sourceName: row.sourceName,
        sourceIcon: row.sourceIcon,
      };
    case 'apiKey':
      return {
        groupBy,
        providerId: row.providerId,
        providerName: row.providerName,
        apiKeyId: row.apiKeyId,
        apiKeyLabel: row.apiKeyLabel,
        apiKeyMasked: row.apiKeyMasked,
        apiKeyAttribution: row.apiKeyAttribution as AiUsageRecordAttribution,
        authMethod: row.authMethod as AiUsageRecordEntry['authMethod'],
      };
  }
}

function rangeConditions(query: { from: number; to: number }): SQL[] {
  return [
    gte(aiUsageRecordTable.createdAt, query.from),
    lte(aiUsageRecordTable.createdAt, query.to),
  ];
}

function scopedCostSum(currency: Currency | undefined): SQL<number> {
  return currency
    ? sql<number>`coalesce(sum(CASE WHEN ${aiUsageRecordTable.costCurrency} = ${currency} THEN ${aiUsageRecordTable.cost} ELSE 0 END), 0)`
    : sql<number>`0`;
}

function totalTokensSum(): SQL<number> {
  return sql<number>`coalesce(sum(${totalTokensValue()}), 0)`;
}

function metricsSelect(currency: Currency | undefined) {
  return {
    totalCost: scopedCostSum(currency),
    totalInputTokens: sql<number>`coalesce(sum(${aiUsageRecordTable.inputTokens}), 0)`,
    totalOutputTokens: sql<number>`coalesce(sum(${aiUsageRecordTable.outputTokens}), 0)`,
    totalTokens: totalTokensSum(),
    totalNoCacheTokens: sql<number>`coalesce(sum(${aiUsageRecordTable.noCacheTokens}), 0)`,
    totalCacheReadTokens: sql<number>`coalesce(sum(${aiUsageRecordTable.cacheReadTokens}), 0)`,
    totalCacheWriteTokens: sql<number>`coalesce(sum(${aiUsageRecordTable.cacheWriteTokens}), 0)`,
    recordCount: sql<number>`count(*)`,
    requestCount: sql<number>`coalesce(sum(${aiUsageRecordTable.requestCount}), 0)`,
    estimatedRequestCount: sql<number>`coalesce(sum(CASE WHEN ${aiUsageRecordTable.recordKind} = 'legacy-aggregate' THEN ${aiUsageRecordTable.requestCount} ELSE 0 END), 0)`,
    unpricedRequestCount: sql<number>`coalesce(sum(CASE WHEN ${aiUsageRecordTable.cost} IS NULL THEN ${aiUsageRecordTable.requestCount} ELSE 0 END), 0)`,
  };
}

type MetricsRow = { [Key in keyof ReturnType<typeof metricsSelect>]: number };

function toMetrics(row: MetricsRow, currency: Currency | undefined): AiUsageRecordStatsMetrics {
  return { costCurrency: currency ?? null, ...row };
}

function subtractMetrics(
  totals: AiUsageRecordStatsMetrics,
  buckets: readonly AiUsageRecordStatsMetrics[],
): AiUsageRecordStatsMetrics {
  const subtract = (read: (value: AiUsageRecordStatsMetrics) => number) =>
    Math.max(0, read(totals) - buckets.reduce((sum, bucket) => sum + read(bucket), 0));
  return {
    costCurrency: totals.costCurrency,
    totalCost: subtract((value) => value.totalCost),
    totalInputTokens: subtract((value) => value.totalInputTokens),
    totalOutputTokens: subtract((value) => value.totalOutputTokens),
    totalTokens: subtract((value) => value.totalTokens),
    totalNoCacheTokens: subtract((value) => value.totalNoCacheTokens),
    totalCacheReadTokens: subtract((value) => value.totalCacheReadTokens),
    totalCacheWriteTokens: subtract((value) => value.totalCacheWriteTokens),
    recordCount: subtract((value) => value.recordCount),
    requestCount: subtract((value) => value.requestCount),
    estimatedRequestCount: subtract((value) => value.estimatedRequestCount),
    unpricedRequestCount: subtract((value) => value.unpricedRequestCount),
  };
}

function aggregateOrder(metric: AiUsageRecordMetric, currency: Currency | undefined): SQL<number> {
  if (metric === 'requests') {
    return sql<number>`coalesce(sum(${aiUsageRecordTable.requestCount}), 0)`;
  }
  return metric === 'cost' ? scopedCostSum(currency) : totalTokensSum();
}

async function getAiUsageRecordStats(
  db: Database,
  query: AiUsageRecordStatsQuery,
): Promise<AiUsageRecordStatsResponse> {
  const where = and(...rangeConditions(query));
  const rows = await db
    .select({ ...groupIdentitySelect(query.groupBy), ...metricsSelect(query.currency) })
    .from(aiUsageRecordTable)
    .where(where)
    .groupBy(...groupIdentityColumns(query.groupBy))
    .orderBy(desc(aggregateOrder(query.metric, query.currency)))
    .limit(query.limit);
  const [totalRow] = await db
    .select(metricsSelect(query.currency))
    .from(aiUsageRecordTable)
    .where(where);
  const buckets: AiUsageRecordStatsBucket[] = rows.map((row) => ({
    ...toStatsGroupIdentity(row, query.groupBy),
    ...toMetrics(row, query.currency),
  }));
  const totals = toMetrics(totalRow as MetricsRow, query.currency);
  return { buckets, totals, other: subtractMetrics(totals, buckets) };
}

function nullableIdentity(column: AnySQLiteColumn, value: string | null): SQL {
  return value === null ? isNull(column) : eq(column, value);
}

function topGroupCondition(
  groupBy: AiUsageRecordGroupBy,
  buckets: AiUsageRecordStatsBucket[],
): SQL | undefined {
  const conditions = buckets.flatMap((bucket): SQL[] => {
    if (bucket.groupBy !== groupBy) return [];
    switch (bucket.groupBy) {
      case 'provider':
        return [nullableIdentity(aiUsageRecordTable.providerId, bucket.providerId)];
      case 'model':
        return [
          requiredCondition(
            and(
              nullableIdentity(aiUsageRecordTable.providerId, bucket.providerId),
              nullableIdentity(aiUsageRecordTable.modelId, bucket.modelId),
            ),
          ),
        ];
      case 'source':
        return [
          requiredCondition(
            and(
              bucket.sourceType === null
                ? isNull(aiUsageRecordTable.sourceType)
                : eq(aiUsageRecordTable.sourceType, bucket.sourceType),
              nullableIdentity(aiUsageRecordTable.sourceId, bucket.sourceId),
            ),
          ),
        ];
      case 'apiKey':
        return [
          requiredCondition(
            and(
              nullableIdentity(aiUsageRecordTable.providerId, bucket.providerId),
              nullableIdentity(aiUsageRecordTable.apiKeyId, bucket.apiKeyId),
              eq(aiUsageRecordTable.apiKeyAttribution, bucket.apiKeyAttribution),
              nullableIdentity(aiUsageRecordTable.authMethod, bucket.authMethod),
            ),
          ),
        ];
      default:
        return [];
    }
  });
  return conditions.length > 0 ? or(...conditions) : undefined;
}

function toTimelineMetrics(
  row: {
    totalCost: number;
    totalTokens: number;
    totalNoCacheTokens: number;
    totalCacheReadTokens: number;
    totalCacheWriteTokens: number;
    recordCount: number;
    requestCount: number;
    estimatedRequestCount: number;
    unpricedRequestCount: number;
  },
  currency: Currency | undefined,
) {
  return { costCurrency: currency ?? null, ...row };
}

async function getAiUsageRecordTimeline(
  db: Database,
  query: AiUsageRecordTimelineQuery,
): Promise<AiUsageRecordTimelineResponse> {
  const baseConditions = rangeConditions(query);
  const where = and(...baseConditions);
  const dayBucket = sql<string>`date(${aiUsageRecordTable.createdAt} / 1000, 'unixepoch', 'localtime')`;
  const timelineMetrics = {
    totalCost: scopedCostSum(query.currency),
    totalTokens: totalTokensSum(),
    totalNoCacheTokens: sql<number>`coalesce(sum(${aiUsageRecordTable.noCacheTokens}), 0)`,
    totalCacheReadTokens: sql<number>`coalesce(sum(${aiUsageRecordTable.cacheReadTokens}), 0)`,
    totalCacheWriteTokens: sql<number>`coalesce(sum(${aiUsageRecordTable.cacheWriteTokens}), 0)`,
    recordCount: sql<number>`count(*)`,
    requestCount: sql<number>`coalesce(sum(${aiUsageRecordTable.requestCount}), 0)`,
    estimatedRequestCount: sql<number>`coalesce(sum(CASE WHEN ${aiUsageRecordTable.recordKind} = 'legacy-aggregate' THEN ${aiUsageRecordTable.requestCount} ELSE 0 END), 0)`,
    unpricedRequestCount: sql<number>`coalesce(sum(CASE WHEN ${aiUsageRecordTable.cost} IS NULL THEN ${aiUsageRecordTable.requestCount} ELSE 0 END), 0)`,
  };
  const dailyTotals = await db
    .select({ date: dayBucket, ...timelineMetrics })
    .from(aiUsageRecordTable)
    .where(where)
    .groupBy(dayBucket)
    .orderBy(asc(dayBucket));
  const dailyCostRows = await db
    .select({
      date: dayBucket,
      currency: aiUsageRecordTable.costCurrency,
      total: sql<number>`coalesce(sum(${aiUsageRecordTable.cost}), 0)`,
    })
    .from(aiUsageRecordTable)
    .where(and(where, isNotNull(aiUsageRecordTable.costCurrency)))
    .groupBy(dayBucket, aiUsageRecordTable.costCurrency)
    .orderBy(asc(dayBucket), asc(aiUsageRecordTable.costCurrency));
  const dailyCosts = dailyCostRows.flatMap((row) =>
    row.currency === null ? [] : [{ date: row.date, currency: row.currency, total: row.total }],
  );
  const costTotals = Array.from(
    dailyCosts.reduce((totals, item) => {
      totals.set(item.currency, (totals.get(item.currency) ?? 0) + item.total);
      return totals;
    }, new Map<Currency, number>()),
    ([currency, total]) => ({ currency, total }),
  ).sort((left, right) => left.currency.localeCompare(right.currency));
  const ungrouped = dailyTotals.map(
    (row): AiUsageRecordTimelineBucket => ({
      date: row.date,
      ...toTimelineMetrics(row, query.currency),
    }),
  );
  if (!query.groupBy || dailyTotals.length === 0) {
    return { buckets: ungrouped, costTotals, dailyCosts };
  }

  const top = await getAiUsageRecordStats(db, {
    groupBy: query.groupBy,
    metric: query.metric,
    currency: query.currency,
    limit: query.limit,
    from: query.from,
    to: query.to,
  });
  const identityWhere = topGroupCondition(query.groupBy, top.buckets);
  if (!identityWhere) return { buckets: [], costTotals, dailyCosts };

  const selectedRows = await db
    .select({
      date: dayBucket,
      ...groupIdentitySelect(query.groupBy),
      ...timelineMetrics,
    })
    .from(aiUsageRecordTable)
    .where(and(...baseConditions, identityWhere))
    .groupBy(dayBucket, ...groupIdentityColumns(query.groupBy))
    .orderBy(asc(dayBucket));
  const selected = selectedRows.map(
    (row): AiUsageRecordTimelineBucket => ({
      ...toGroupIdentity(row, query.groupBy),
      date: row.date,
      ...toTimelineMetrics(row, query.currency),
    }),
  );
  const selectedByDate = new Map<string, AiUsageRecordTimelineBucket[]>();
  for (const bucket of selected) {
    const dateBuckets = selectedByDate.get(bucket.date) ?? [];
    dateBuckets.push(bucket);
    selectedByDate.set(bucket.date, dateBuckets);
  }
  const other = ungrouped.flatMap((total): AiUsageRecordTimelineBucket[] => {
    const dateBuckets = selectedByDate.get(total.date) ?? [];
    const sum = (read: (bucket: AiUsageRecordTimelineBucket) => number) =>
      dateBuckets.reduce((value, bucket) => value + read(bucket), 0);
    const recordCount = Math.max(0, total.recordCount - sum((bucket) => bucket.recordCount));
    if (recordCount === 0) return [];
    return [
      {
        date: total.date,
        costCurrency: total.costCurrency,
        totalCost: Math.max(0, total.totalCost - sum((bucket) => bucket.totalCost)),
        totalTokens: Math.max(0, total.totalTokens - sum((bucket) => bucket.totalTokens)),
        totalNoCacheTokens: Math.max(
          0,
          total.totalNoCacheTokens - sum((bucket) => bucket.totalNoCacheTokens),
        ),
        totalCacheReadTokens: Math.max(
          0,
          total.totalCacheReadTokens - sum((bucket) => bucket.totalCacheReadTokens),
        ),
        totalCacheWriteTokens: Math.max(
          0,
          total.totalCacheWriteTokens - sum((bucket) => bucket.totalCacheWriteTokens),
        ),
        recordCount,
        requestCount: Math.max(0, total.requestCount - sum((bucket) => bucket.requestCount)),
        estimatedRequestCount: Math.max(
          0,
          total.estimatedRequestCount - sum((bucket) => bucket.estimatedRequestCount),
        ),
        unpricedRequestCount: Math.max(
          0,
          total.unpricedRequestCount - sum((bucket) => bucket.unpricedRequestCount),
        ),
        isOther: true,
      },
    ];
  });
  return { buckets: [...selected, ...other], costTotals, dailyCosts };
}

export class AiUsageRecordService {
  /**
   * Resolved per call rather than injected once, so the instance holds no
   * reference to a particular host generation and a replaced host cannot leave
   * this singleton writing to a closed connection.
   */
  private get dbService() {
    return application.get('DbService');
  }

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

  async list(query: AiUsageRecordListQueryParams = {}): Promise<AiUsageRecordListResponse> {
    return listAiUsageRecords(this.dbService.getDb(), AiUsageRecordListQuerySchema.parse(query));
  }

  async stats(query: AiUsageRecordStatsQueryParams): Promise<AiUsageRecordStatsResponse> {
    return getAiUsageRecordStats(
      this.dbService.getDb(),
      AiUsageRecordStatsQuerySchema.parse(query),
    );
  }

  async timeline(query: AiUsageRecordTimelineQueryParams): Promise<AiUsageRecordTimelineResponse> {
    return getAiUsageRecordTimeline(
      this.dbService.getDb(),
      AiUsageRecordTimelineQuerySchema.parse(query),
    );
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

export const aiUsageRecordService = new AiUsageRecordService();
