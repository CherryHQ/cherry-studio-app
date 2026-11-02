/** Read-only query contracts for best-effort AI usage records. */

import * as z from 'zod';

import type { CursorPaginationParams, CursorPaginationResponse } from '@/shared/data/api/types';
import {
  type AiUsageRecordAttribution,
  type AiUsageRecordEntry,
  AiUsageRecordMessageKindSchema,
  AiUsageRecordModalitySchema,
  AiUsageRecordSourceTypeSchema,
  AiUsageRecordAttributionSchema,
  AiUsageRecordAuthMethodSchema,
} from '@/shared/data/types/aiUsageRecord';
import { CURRENCY, type Currency, objectValues } from '@/shared/data/types/model';

export const AI_USAGE_RECORD_DEFAULT_LIMIT = 50;
export const AI_USAGE_RECORD_MAX_LIMIT = 200;
export const AI_USAGE_RECORD_AGGREGATE_DEFAULT_LIMIT = 10;
export const AI_USAGE_RECORD_AGGREGATE_MAX_LIMIT = 50;
export const AI_USAGE_RECORD_MAX_RANGE_DAYS = 366;

const CurrencySchema = z.enum(objectValues(CURRENCY));
const TimeRangeFields = {
  from: z.number().int().nonnegative(),
  to: z.number().int().nonnegative(),
};

function validateTimeRange(value: { from: number; to: number }, ctx: z.RefinementCtx): void {
  if (value.to < value.from) {
    ctx.addIssue({
      code: 'custom',
      path: ['to'],
      message: 'to must be greater than or equal to from',
    });
    return;
  }
  const maxRangeMs = AI_USAGE_RECORD_MAX_RANGE_DAYS * 24 * 60 * 60 * 1000;
  if (value.to - value.from > maxRangeMs) {
    ctx.addIssue({
      code: 'custom',
      path: ['to'],
      message: `time range must not exceed ${AI_USAGE_RECORD_MAX_RANGE_DAYS} days`,
    });
  }
}

export const AiUsageRecordListSortBySchema = z.enum([
  'createdAt',
  'totalTokens',
  'cost',
  'timeFirstTokenMs',
  'tokensPerSecond',
]);
export type AiUsageRecordListSortBy = z.infer<typeof AiUsageRecordListSortBySchema>;
export const AiUsageRecordSortOrderSchema = z.enum(['asc', 'desc']);
export type AiUsageRecordSortOrder = z.infer<typeof AiUsageRecordSortOrderSchema>;

/** Snapshot identities, shared by charts, rankings and record drill-down. Null selects unknown. */
const UsageFilterFields = {
  providerId: z.string().nullable().optional(),
  modelId: z.string().nullable().optional(),
  sourceType: AiUsageRecordSourceTypeSchema.nullable().optional(),
  sourceId: z.string().nullable().optional(),
  apiKeyId: z.string().nullable().optional(),
  apiKeyAttribution: AiUsageRecordAttributionSchema.optional(),
  authMethod: AiUsageRecordAuthMethodSchema.nullable().optional(),
  modality: AiUsageRecordModalitySchema.optional(),
  search: z.string().trim().max(200).optional(),
};
export const AiUsageRecordFiltersSchema = z.strictObject(UsageFilterFields);
export type AiUsageRecordFilters = z.infer<typeof AiUsageRecordFiltersSchema>;

export const AiUsageRecordListQuerySchema = z
  .strictObject({
    ...UsageFilterFields,
    cursor: z.string().optional(),
    limit: z.int().positive().max(AI_USAGE_RECORD_MAX_LIMIT).default(AI_USAGE_RECORD_DEFAULT_LIMIT),
    sortBy: AiUsageRecordListSortBySchema.default('createdAt'),
    sortOrder: AiUsageRecordSortOrderSchema.default('desc'),
    from: z.number().int().nonnegative().optional(),
    to: z.number().int().nonnegative().optional(),
    messageKind: AiUsageRecordMessageKindSchema.optional(),
    messageId: z.string().min(1).optional(),
    costCurrency: CurrencySchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.sortBy === 'cost' && value.costCurrency === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['costCurrency'],
        message: 'costCurrency is required for cost sorting',
      });
    }
    if ((value.messageKind === undefined) !== (value.messageId === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: value.messageKind === undefined ? ['messageKind'] : ['messageId'],
        message: 'messageKind and messageId must be provided together',
      });
    }
  });
export type AiUsageRecordListQuery = z.infer<typeof AiUsageRecordListQuerySchema>;
export type AiUsageRecordListQueryParams = z.input<typeof AiUsageRecordListQuerySchema> &
  CursorPaginationParams;

export const AiUsageRecordGroupBySchema = z.enum(['provider', 'apiKey', 'model', 'source']);
export type AiUsageRecordGroupBy = z.infer<typeof AiUsageRecordGroupBySchema>;
export const AiUsageRecordMetricSchema = z.enum(['tokens', 'requests', 'cost']);
export type AiUsageRecordMetric = z.infer<typeof AiUsageRecordMetricSchema>;

const AggregateQueryFields = {
  ...UsageFilterFields,
  metric: AiUsageRecordMetricSchema.default('tokens'),
  currency: CurrencySchema.optional(),
  limit: z
    .int()
    .positive()
    .max(AI_USAGE_RECORD_AGGREGATE_MAX_LIMIT)
    .default(AI_USAGE_RECORD_AGGREGATE_DEFAULT_LIMIT),
  ...TimeRangeFields,
};

function validateAggregateQuery(
  value: { metric: AiUsageRecordMetric; currency?: Currency; from: number; to: number },
  ctx: z.RefinementCtx,
): void {
  validateTimeRange(value, ctx);
  if (value.metric === 'cost' && value.currency === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['currency'],
      message: 'currency is required for cost aggregation',
    });
  }
}

export const AiUsageRecordStatsQuerySchema = z
  .strictObject({ groupBy: AiUsageRecordGroupBySchema, ...AggregateQueryFields })
  .superRefine(validateAggregateQuery);
export type AiUsageRecordStatsQuery = z.infer<typeof AiUsageRecordStatsQuerySchema>;
export type AiUsageRecordStatsQueryParams = z.input<typeof AiUsageRecordStatsQuerySchema>;

export const AiUsageRecordTimelineQuerySchema = z
  .strictObject({ groupBy: AiUsageRecordGroupBySchema.optional(), ...AggregateQueryFields })
  .superRefine(validateAggregateQuery);
export type AiUsageRecordTimelineQuery = z.infer<typeof AiUsageRecordTimelineQuerySchema>;
export type AiUsageRecordTimelineQueryParams = z.input<typeof AiUsageRecordTimelineQuerySchema>;

export interface AiUsageRecordListResponse extends CursorPaginationResponse<AiUsageRecordEntry> {
  total: number;
}

export interface AiUsageRecordGroupIdentity {
  providerId?: string | null;
  providerName?: string | null;
  sourceType?: AiUsageRecordEntry['sourceType'];
  sourceId?: string | null;
  sourceName?: string | null;
  sourceIcon?: string | null;
  apiKeyId?: string | null;
  apiKeyLabel?: string | null;
  apiKeyMasked?: string | null;
  apiKeyAttribution?: AiUsageRecordAttribution;
  authMethod?: AiUsageRecordEntry['authMethod'];
  modelId?: string | null;
}

export type AiUsageRecordStatsGroupIdentity =
  | { groupBy: 'provider'; providerId: string | null; providerName: string | null }
  | {
      groupBy: 'apiKey';
      providerId: string | null;
      providerName: string | null;
      apiKeyId: string | null;
      apiKeyLabel: string | null;
      apiKeyMasked: string | null;
      apiKeyAttribution: AiUsageRecordAttribution;
      authMethod: AiUsageRecordEntry['authMethod'];
    }
  | {
      groupBy: 'model';
      providerId: string | null;
      providerName: string | null;
      modelId: string | null;
    }
  | {
      groupBy: 'source';
      sourceType: AiUsageRecordEntry['sourceType'];
      sourceId: string | null;
      sourceName: string | null;
      sourceIcon: string | null;
    };

export interface AiUsageRecordStatsMetrics {
  costCurrency: Currency | null;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalNoCacheTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  recordCount: number;
  tokenRecordCount: number;
  costRecordCount: number;
  requestCount: number;
  estimatedRequestCount: number;
  unpricedRequestCount: number;
}

export type AiUsageRecordStatsBucket = AiUsageRecordStatsGroupIdentity & AiUsageRecordStatsMetrics;
export interface AiUsageRecordStatsResponse {
  buckets: AiUsageRecordStatsBucket[];
  totals: AiUsageRecordStatsMetrics;
  other: AiUsageRecordStatsMetrics;
}

export interface AiUsageRecordTimelineBucket extends AiUsageRecordGroupIdentity {
  date: string;
  costCurrency: Currency | null;
  totalTokens: number;
  totalNoCacheTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  totalCost: number;
  recordCount: number;
  tokenRecordCount: number;
  costRecordCount: number;
  requestCount: number;
  estimatedRequestCount: number;
  unpricedRequestCount: number;
  isOther?: true;
}

export interface AiUsageRecordCostTotal {
  currency: Currency;
  total: number;
}
export interface AiUsageRecordDailyCost extends AiUsageRecordCostTotal {
  date: string;
}
export interface AiUsageRecordTimelineResponse {
  buckets: AiUsageRecordTimelineBucket[];
  costTotals: AiUsageRecordCostTotal[];
  dailyCosts: AiUsageRecordDailyCost[];
}

/** Full-history analytics use adaptive buckets rather than the daily endpoint's range cap. */
export const AiUsageRecordAnalyticsQuerySchema = z
  .strictObject({
    groupBy: AiUsageRecordGroupBySchema,
    ...AggregateQueryFields,
    includePerformance: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.to < value.from) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'to must not precede from' });
    }
    if (value.metric === 'cost' && value.currency === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['currency'],
        message: 'currency is required for cost aggregation',
      });
    }
  });
export type AiUsageRecordAnalyticsQuery = z.infer<typeof AiUsageRecordAnalyticsQuerySchema>;
export type AiUsageRecordAnalyticsQueryParams = z.input<typeof AiUsageRecordAnalyticsQuerySchema>;
export type AiUsageRecordGranularity = 'day' | 'month' | 'year';
export type AiUsageRecordPerformanceMetric =
  | 'timeFirstTokenMs'
  | 'timeCompletionMs'
  | 'timeThinkingMs'
  | 'tokensPerSecond';
export interface AiUsageRecordPerformanceSummary {
  sampleCount: number;
  average: number | null;
  median: number | null;
  p95: number | null;
}
export interface AiUsageRecordAnalyticsResponse {
  stats: AiUsageRecordStatsResponse;
  timeline: AiUsageRecordTimelineResponse;
  granularity: AiUsageRecordGranularity;
  firstRecordAt: number | null;
  composition: {
    totalTokens: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    reasoningTokens: number | null;
    noCacheTokens: number | null;
    cacheReadTokens: number | null;
    cacheWriteTokens: number | null;
    imageCount: number | null;
  };
  performance?: Record<AiUsageRecordPerformanceMetric, AiUsageRecordPerformanceSummary>;
  providerReportedRequestCount: number;
  computedRequestCount: number;
}

export type AiUsageRecordSchemas = {
  '/ai-usage-records/analytics': {
    GET: { query: AiUsageRecordAnalyticsQueryParams; response: AiUsageRecordAnalyticsResponse };
  };
  '/ai-usage-records': {
    GET: { query?: AiUsageRecordListQueryParams; response: AiUsageRecordListResponse };
  };
  '/ai-usage-records/stats': {
    GET: { query: AiUsageRecordStatsQuery; response: AiUsageRecordStatsResponse };
  };
  '/ai-usage-records/timeline': {
    GET: { query: AiUsageRecordTimelineQuery; response: AiUsageRecordTimelineResponse };
  };
};
