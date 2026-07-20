import { type SQLWrapper, sql } from 'drizzle-orm';
import { check, index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { chatMessageRoles } from '@/data/types/file';

import { createUpdateTimestamps, uuidPrimaryKey } from './_columnHelpers';
import { fileEntryTable } from './file';
import { messageTable } from './message';

function sqlStringList(values: readonly string[]) {
  return sql.raw(values.map((value) => `'${value.replaceAll("'", "''")}'`).join(', '));
}

function roleCheck(column: SQLWrapper, roles: readonly string[]) {
  return sql`${column} IN (${sqlStringList(roles)})`;
}

export const chatMessageFileRefTable = sqliteTable(
  'chat_message_file_ref',
  {
    id: uuidPrimaryKey(),
    fileEntryId: text()
      .notNull()
      .references(() => fileEntryTable.id, { onDelete: 'cascade' }),
    sourceId: text()
      .notNull()
      .references(() => messageTable.id, { onDelete: 'cascade' }),
    role: text().notNull().$type<(typeof chatMessageRoles)[number]>(),
    ...createUpdateTimestamps,
  },
  (table) => [
    index('cmfr_entry_id_idx').on(table.fileEntryId),
    index('cmfr_source_id_idx').on(table.sourceId),
    uniqueIndex('cmfr_unique_idx').on(table.fileEntryId, table.sourceId, table.role),
    check('cmfr_role_check', roleCheck(table.role, chatMessageRoles)),
  ],
);

export type ChatMessageFileRefRow = typeof chatMessageFileRefTable.$inferSelect;
export type InsertChatMessageFileRefRow = typeof chatMessageFileRefTable.$inferInsert;
