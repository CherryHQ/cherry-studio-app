import type { DirectEndpoint, RemoteAuthorization } from '@cherrystudio/remote-protocol';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { createUpdateTimestamps } from './_columnHelpers';

/** A desktop paired over remote access; grants name the capabilities the desktop user approved. */
export const desktopConnectionTable = sqliteTable('desktop_connection', {
  id: text().primaryKey(),
  name: text().notNull(),
  deviceId: text('device_id').notNull(),
  desktopIdentity: text('desktop_identity').notNull(),
  configuredEndpoints: text('configured_endpoints', { mode: 'json' })
    .$type<DirectEndpoint[]>()
    .notNull()
    .default([]),
  grants: text({ mode: 'json' }).$type<RemoteAuthorization['grants']>().notNull(),
  status: text().$type<'needs-repair' | 'paired'>().notNull().default('paired'),
  lastFetchedAt: integer('last_fetched_at'),
  ...createUpdateTimestamps,
});

export type DesktopConnectionRow = typeof desktopConnectionTable.$inferSelect;
export type InsertDesktopConnectionRow = typeof desktopConnectionTable.$inferInsert;
