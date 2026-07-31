import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import type {
  AiUsageCostBreakdown,
  AiUsagePricingSnapshot,
  AiUsageRecordAttribution,
  AiUsageRecordAuthMethod,
  AiUsageRecordCostSource,
  AiUsageRecordKind,
  AiUsageRecordMessageKind,
  AiUsageRecordModality,
  AiUsageRecordSourceType,
} from '@/shared/data/types/aiUsageRecord';
import {
  AiUsageRecordAttributionSchema,
  AiUsageRecordAuthMethodSchema,
  AiUsageRecordCostSourceSchema,
  AiUsageRecordKindSchema,
  AiUsageRecordMessageKindSchema,
  AiUsageRecordModalitySchema,
  AiUsageRecordSourceTypeSchema,
} from '@/shared/data/types/aiUsageRecord';
import { CURRENCY, type Currency, objectValues } from '@/shared/data/types/model';

import { uuidPrimaryKeyOrdered } from './_columnHelpers';

const sqlEnumValues = (values: readonly string[]) => values.map((value) => `'${value}'`).join(', ');
const attributionCheckValues = sqlEnumValues(AiUsageRecordAttributionSchema.options);
const authMethodCheckValues = sqlEnumValues(AiUsageRecordAuthMethodSchema.options);
const costCurrencyCheckValues = sqlEnumValues(objectValues(CURRENCY));
const costSourceCheckValues = sqlEnumValues(AiUsageRecordCostSourceSchema.options);
const messageKindCheckValues = sqlEnumValues(AiUsageRecordMessageKindSchema.options);
const modalityCheckValues = sqlEnumValues(AiUsageRecordModalitySchema.options);
const recordKindCheckValues = sqlEnumValues(AiUsageRecordKindSchema.options);
const sourceTypeCheckValues = sqlEnumValues(AiUsageRecordSourceTypeSchema.options);

/** Immutable best-effort fact for one observable provider invocation. */
export const aiUsageRecordTable = sqliteTable(
  'ai_usage_record',
  {
    id: uuidPrimaryKeyOrdered(),
    requestId: text().notNull(),
    recordKind: text().$type<AiUsageRecordKind>().notNull(),
    requestCount: integer().notNull(),
    messageKind: text().$type<AiUsageRecordMessageKind>(),
    messageId: text(),
    providerId: text(),
    providerName: text(),
    modelId: text(),
    modelName: text(),
    sourceType: text().$type<AiUsageRecordSourceType>(),
    sourceId: text(),
    sourceName: text(),
    sourceIcon: text(),
    modality: text().$type<AiUsageRecordModality>().notNull(),
    apiKeyId: text(),
    apiKeyLabel: text(),
    apiKeyMasked: text(),
    apiKeyAttribution: text().$type<AiUsageRecordAttribution>().notNull(),
    authMethod: text().$type<AiUsageRecordAuthMethod>(),
    inputTokens: integer(),
    outputTokens: integer(),
    totalTokens: integer(),
    reasoningTokens: integer(),
    noCacheTokens: integer(),
    cacheReadTokens: integer(),
    cacheWriteTokens: integer(),
    imageCount: integer(),
    cost: real(),
    costCurrency: text().$type<Currency>(),
    costSource: text().$type<AiUsageRecordCostSource>(),
    costBreakdown: text({ mode: 'json' }).$type<AiUsageCostBreakdown>(),
    pricingSnapshot: text({ mode: 'json' }).$type<AiUsagePricingSnapshot>(),
    timeFirstTokenMs: integer(),
    timeCompletionMs: integer(),
    timeThinkingMs: integer(),
    createdAt: integer()
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    uniqueIndex('ai_usage_record_request_id_idx').on(table.requestId),
    index('ai_usage_record_created_at_idx').on(table.createdAt),
    index('ai_usage_record_message_created_idx').on(
      table.messageKind,
      table.messageId,
      table.createdAt,
    ),
    index('ai_usage_record_provider_created_idx').on(table.providerId, table.createdAt),
    index('ai_usage_record_model_created_idx').on(table.modelId, table.createdAt),
    index('ai_usage_record_api_key_created_idx').on(table.apiKeyId, table.createdAt),
    index('ai_usage_record_source_created_idx').on(
      table.sourceType,
      table.sourceId,
      table.createdAt,
    ),
    check(
      'ai_usage_record_record_kind_check',
      sql`${table.recordKind} IN (${sql.raw(recordKindCheckValues)})`,
    ),
    check(
      'ai_usage_record_message_kind_check',
      sql`${table.messageKind} IN (${sql.raw(messageKindCheckValues)})`,
    ),
    check(
      'ai_usage_record_source_type_check',
      sql`${table.sourceType} IN (${sql.raw(sourceTypeCheckValues)})`,
    ),
    check(
      'ai_usage_record_modality_check',
      sql`${table.modality} IN (${sql.raw(modalityCheckValues)})`,
    ),
    check(
      'ai_usage_record_attribution_check',
      sql`${table.apiKeyAttribution} IN (${sql.raw(attributionCheckValues)})`,
    ),
    check(
      'ai_usage_record_auth_method_check',
      sql`${table.authMethod} IN (${sql.raw(authMethodCheckValues)})`,
    ),
    check(
      'ai_usage_record_cost_source_check',
      sql`${table.costSource} IN (${sql.raw(costSourceCheckValues)})`,
    ),
    check(
      'ai_usage_record_cost_currency_check',
      sql`${table.costCurrency} IN (${sql.raw(costCurrencyCheckValues)})`,
    ),
    check(
      'ai_usage_record_kind_identity_check',
      sql`(
        ${table.recordKind} = 'invocation'
        AND ${table.requestCount} = 1
        AND ${table.providerId} IS NOT NULL
        AND ${table.modelId} IS NOT NULL
      ) OR (
        ${table.recordKind} = 'legacy-aggregate'
        AND ${table.requestCount} >= 1
        AND ${table.messageKind} IS NOT NULL
        AND ${table.messageId} IS NOT NULL
      )`,
    ),
    check(
      'ai_usage_record_message_identity_check',
      sql`(${table.messageKind} IS NULL AND ${table.messageId} IS NULL)
        OR (${table.messageKind} IS NOT NULL AND ${table.messageId} IS NOT NULL)`,
    ),
    check(
      'ai_usage_record_source_identity_check',
      sql`(
        ${table.sourceType} IS NULL
        AND ${table.sourceId} IS NULL
        AND ${table.sourceName} IS NULL
        AND ${table.sourceIcon} IS NULL
      ) OR (
        ${table.sourceType} IS NOT NULL
        AND ${table.sourceId} IS NOT NULL
      )`,
    ),
    check(
      'ai_usage_record_api_key_identity_check',
      sql`(
        ${table.apiKeyAttribution} IN ('explicit', 'matched')
        AND ${table.apiKeyId} IS NOT NULL
        AND ${table.authMethod} IS NULL
      ) OR (
        ${table.apiKeyAttribution} = 'auth'
        AND ${table.apiKeyId} IS NULL
        AND ${table.apiKeyLabel} IS NULL
        AND ${table.apiKeyMasked} IS NULL
        AND ${table.authMethod} IS NOT NULL
      ) OR (
        ${table.apiKeyAttribution} = 'unknown'
        AND ${table.apiKeyId} IS NULL
        AND ${table.apiKeyLabel} IS NULL
        AND ${table.apiKeyMasked} IS NULL
        AND ${table.authMethod} IS NULL
      )`,
    ),
    check(
      'ai_usage_record_cost_tuple_check',
      sql`(
        ${table.cost} IS NULL
        AND ${table.costCurrency} IS NULL
        AND ${table.costSource} IS NULL
        AND ${table.costBreakdown} IS NULL
      ) OR (
        ${table.cost} IS NOT NULL
        AND ${table.costCurrency} IS NOT NULL
        AND ${table.costSource} IS NOT NULL
      )`,
    ),
    check(
      'ai_usage_record_image_count_check',
      sql`(
        ${table.modality} = 'image'
        AND ${table.imageCount} IS NOT NULL
        AND ${table.imageCount} >= 0
      ) OR (
        ${table.modality} <> 'image'
        AND ${table.imageCount} IS NULL
      )`,
    ),
    check(
      'ai_usage_record_nonnegative_check',
      sql`
        (${table.inputTokens} IS NULL OR ${table.inputTokens} >= 0)
        AND (${table.outputTokens} IS NULL OR ${table.outputTokens} >= 0)
        AND (${table.totalTokens} IS NULL OR ${table.totalTokens} >= 0)
        AND (${table.reasoningTokens} IS NULL OR ${table.reasoningTokens} >= 0)
        AND (${table.noCacheTokens} IS NULL OR ${table.noCacheTokens} >= 0)
        AND (${table.cacheReadTokens} IS NULL OR ${table.cacheReadTokens} >= 0)
        AND (${table.cacheWriteTokens} IS NULL OR ${table.cacheWriteTokens} >= 0)
        AND (${table.cost} IS NULL OR ${table.cost} >= 0)
        AND (${table.timeFirstTokenMs} IS NULL OR ${table.timeFirstTokenMs} >= 0)
        AND (${table.timeCompletionMs} IS NULL OR ${table.timeCompletionMs} >= 0)
        AND (${table.timeThinkingMs} IS NULL OR ${table.timeThinkingMs} >= 0)
      `,
    ),
    check(
      'ai_usage_record_integer_check',
      sql`
        typeof(${table.requestCount}) = 'integer'
        AND (${table.inputTokens} IS NULL OR typeof(${table.inputTokens}) = 'integer')
        AND (${table.outputTokens} IS NULL OR typeof(${table.outputTokens}) = 'integer')
        AND (${table.totalTokens} IS NULL OR typeof(${table.totalTokens}) = 'integer')
        AND (${table.reasoningTokens} IS NULL OR typeof(${table.reasoningTokens}) = 'integer')
        AND (${table.noCacheTokens} IS NULL OR typeof(${table.noCacheTokens}) = 'integer')
        AND (${table.cacheReadTokens} IS NULL OR typeof(${table.cacheReadTokens}) = 'integer')
        AND (${table.cacheWriteTokens} IS NULL OR typeof(${table.cacheWriteTokens}) = 'integer')
        AND (${table.imageCount} IS NULL OR typeof(${table.imageCount}) = 'integer')
        AND (${table.timeFirstTokenMs} IS NULL OR typeof(${table.timeFirstTokenMs}) = 'integer')
        AND (${table.timeCompletionMs} IS NULL OR typeof(${table.timeCompletionMs}) = 'integer')
        AND (${table.timeThinkingMs} IS NULL OR typeof(${table.timeThinkingMs}) = 'integer')
        AND typeof(${table.createdAt}) = 'integer'
      `,
    ),
    check(
      'ai_usage_record_finite_cost_check',
      sql`${table.cost} IS NULL OR ${table.cost} <= 1.7976931348623157e308`,
    ),
  ],
);

export type AiUsageRecordRow = typeof aiUsageRecordTable.$inferSelect;
export type InsertAiUsageRecordRow = typeof aiUsageRecordTable.$inferInsert;
