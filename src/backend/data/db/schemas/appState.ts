import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { createUpdateTimestamps } from './_columnHelpers';

export const appStateTable = sqliteTable('app_state', {
  key: text().primaryKey(),
  value: text({ mode: 'json' }).notNull(), // JSON field, drizzle handles serialization automatically
  description: text(), // Optional description field
  ...createUpdateTimestamps,
});

/** Enterprise sync bookkeeping; cleared when local data is restored into an enterprise profile. */
export const ENTERPRISE_SYNC_STATE_KEY = 'enterprise.sync';

/** The enterprise identity a backup database was exported from; only it may restore the backup. */
export const BACKUP_PROFILE_KEY = 'backup.profile';
