import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

import {
  createUpdateTimestamps,
  orderKeyColumns,
  scopedOrderKeyIndex,
  uuidPrimaryKey,
} from './_columnHelpers';

/**
 * Group table - general-purpose grouping for entities
 *
 * Supports grouping of topics, sessions, and assistants.
 * Each group belongs to a specific entity type; ordering is scoped per entityType
 * via a fractional-indexing `orderKey` (see services/utils/orderKey.ts).
 */
export const groupTable = sqliteTable(
  'group',
  {
    id: uuidPrimaryKey(),
    entityType: text().notNull(),
    name: text().notNull(),
    ...orderKeyColumns,
    ...createUpdateTimestamps,
  },
  (table) => [scopedOrderKeyIndex('group', 'entityType')(table)],
);

export type InsertGroupRow = typeof groupTable.$inferInsert;
export type GroupRow = typeof groupTable.$inferSelect;
