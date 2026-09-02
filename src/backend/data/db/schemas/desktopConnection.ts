import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

import { createUpdateTimestamps } from './_columnHelpers';

export const desktopConnectionTable = sqliteTable('desktop_connection', {
  id: text().primaryKey(),
  name: text().notNull(),
  baseUrls: text('base_urls', { mode: 'json' }).$type<string[]>().notNull(),
  activeBaseUrl: text('active_base_url').notNull(),
  desktopVersion: text('desktop_version').notNull(),
  status: text().$type<'needs-repair' | 'paired'>().notNull().default('paired'),
  lastFetchedAt: integer('last_fetched_at'),
  ...createUpdateTimestamps,
});

export type DesktopConnectionRow = typeof desktopConnectionTable.$inferSelect;
export type InsertDesktopConnectionRow = typeof desktopConnectionTable.$inferInsert;
