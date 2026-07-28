import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { createUpdateTimestamps } from './_columnHelpers';

export const preferenceTable = sqliteTable(
  'preference',
  {
    scope: text().notNull().default('default'),
    key: text().notNull(),
    value: text({ mode: 'json' }),
    ...createUpdateTimestamps,
  },
  (table) => [primaryKey({ columns: [table.scope, table.key] })],
);

export type InsertPreferenceRow = typeof preferenceTable.$inferInsert;
export type PreferenceRow = typeof preferenceTable.$inferSelect;
