import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { createUpdateTimestamps, uuidPrimaryKey } from './_columnHelpers';

/** Credentials stay in device-only secure storage; backup contains opaque references only. */
export const sshProfileTable = sqliteTable('ssh_profile', {
  id: uuidPrimaryKey(),
  revision: text().notNull(),
  name: text().notNull(),
  host: text().notNull(),
  port: integer().notNull().default(22),
  username: text().notNull(),
  authMethod: text('auth_method').$type<'password' | 'privateKey'>().notNull(),
  credentialReference: text('credential_reference').notNull(),
  fingerprint: text(),
  ...createUpdateTimestamps,
});
export type SshProfileRow = typeof sshProfileTable.$inferSelect;
export type InsertSshProfileRow = typeof sshProfileTable.$inferInsert;
