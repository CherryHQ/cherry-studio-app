import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

import {
  createUpdateTimestamps,
  orderKeyColumns,
  orderKeyIndex,
  uuidPrimaryKeyOrdered,
} from './_columnHelpers';

export const paintingTable = sqliteTable(
  'painting',
  {
    id: uuidPrimaryKeyOrdered(),
    providerId: text().notNull(),
    modelId: text(),
    prompt: text().notNull(),
    ...orderKeyColumns,
    ...createUpdateTimestamps,
  },
  (table) => [orderKeyIndex('painting')(table)],
);

export type PaintingRow = typeof paintingTable.$inferSelect;
export type InsertPaintingRow = typeof paintingTable.$inferInsert;
