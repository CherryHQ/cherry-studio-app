import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { createUpdateTimestamps } from './_columnHelpers';

export const DEFAULT_PREFERENCE_SCOPE = 'default';

export const preferenceTable = sqliteTable(
  'preference',
  {
    // Reserved for future use; mobile currently reads and writes only the default scope.
    scope: text().notNull().default(DEFAULT_PREFERENCE_SCOPE),
    key: text().notNull(),
    value: text({ mode: 'json' }),
    ...createUpdateTimestamps,
  },
  (t) => [primaryKey({ columns: [t.scope, t.key] })],
);

export type PreferenceRow = typeof preferenceTable.$inferSelect;
export type InsertPreferenceRow = typeof preferenceTable.$inferInsert;
