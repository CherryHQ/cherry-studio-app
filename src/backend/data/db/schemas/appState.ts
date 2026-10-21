import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { createUpdateTimestamps } from './_columnHelpers';

export const appStateTable = sqliteTable('app_state', {
  key: text().primaryKey(),
  value: text({ mode: 'json' }).notNull(), // JSON field, drizzle handles serialization automatically
  description: text(), // Optional description field
  ...createUpdateTimestamps,
});

/** Enterprise sync bookkeeping; cleared so a restored database is projected again. */
export const ENTERPRISE_SYNC_STATE_KEY = 'enterprise.sync';
