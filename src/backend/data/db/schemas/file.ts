import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { createUpdateDeleteTimestamps, uuidPrimaryKeyOrdered } from './_columnHelpers';

export const fileEntryTable = sqliteTable(
  'file_entry',
  {
    id: uuidPrimaryKeyOrdered(),
    origin: text().notNull(),
    name: text().notNull(),
    ext: text(),
    size: integer(),
    externalPath: text(),
    ...createUpdateDeleteTimestamps,
  },
  (table) => [
    index('fe_deleted_at_idx').on(table.deletedAt),
    index('fe_created_at_idx').on(table.createdAt),
    uniqueIndex('fe_external_path_lower_unique_idx').on(sql`lower(${table.externalPath})`),
    index('fe_external_path_idx').on(table.externalPath),
    check('fe_origin_check', sql`${table.origin} IN ('internal', 'external')`),
    check(
      'fe_origin_consistency',
      sql`(${table.origin} = 'internal' AND ${table.externalPath} IS NULL) OR (${table.origin} = 'external' AND ${table.externalPath} IS NOT NULL)`,
    ),
    check(
      'fe_external_no_delete',
      sql`${table.origin} != 'external' OR ${table.deletedAt} IS NULL`,
    ),
    check(
      'fe_size_internal_only',
      sql`(${table.origin} = 'internal' AND ${table.size} IS NOT NULL AND ${table.size} >= 0) OR (${table.origin} = 'external' AND ${table.size} IS NULL)`,
    ),
  ],
);

export type FileEntryRow = typeof fileEntryTable.$inferSelect;
export type InsertFileEntryRow = typeof fileEntryTable.$inferInsert;
