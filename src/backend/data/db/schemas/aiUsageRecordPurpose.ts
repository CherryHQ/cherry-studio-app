import { sql } from 'drizzle-orm';
import { check, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { AI_USAGE_PURPOSES, type AiUsagePurpose } from '@/shared/data/types/aiUsagePurpose';

import { aiUsageRecordTable } from './aiUsageRecord';

export const aiUsageRecordPurposeTable = sqliteTable(
  'ai_usage_record_purpose',
  {
    requestId: text()
      .primaryKey()
      .notNull()
      .references(() => aiUsageRecordTable.requestId, { onDelete: 'cascade' }),
    purpose: text().$type<AiUsagePurpose>().notNull(),
  },
  (t) => [
    check(
      'ai_usage_record_purpose_purpose_check',
      sql`${t.purpose} IN (${sql.raw(AI_USAGE_PURPOSES.map((value) => `'${value}'`).join(', '))})`,
    ),
  ],
);

export type AiUsageRecordPurposeRow = typeof aiUsageRecordPurposeTable.$inferSelect;
export type InsertAiUsageRecordPurposeRow = typeof aiUsageRecordPurposeTable.$inferInsert;
