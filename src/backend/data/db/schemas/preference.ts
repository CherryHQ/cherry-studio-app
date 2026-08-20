import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { createUpdateTimestamps } from './_columnHelpers';

export const preferenceTable = sqliteTable('preference', {
  key: text().primaryKey(),
  value: text({ mode: 'json' }),
  ...createUpdateTimestamps,
});

export type PreferenceRow = typeof preferenceTable.$inferSelect;
export type InsertPreferenceRow = typeof preferenceTable.$inferInsert;
