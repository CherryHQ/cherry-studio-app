import { sql } from 'drizzle-orm';
import { check, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import * as z from 'zod';

import type { PluginId } from '@/shared/data/types/plugin';

import { createUpdateTimestamps, uuidPrimaryKey } from './_columnHelpers';

/** SQLite stores only these opaque references; native storage owns their values. */
export const PluginSecretReferenceSchema = z.strictObject({
  storage: z.literal('secure-store-v1'),
  id: z.string().uuid(),
});
export type PluginSecretReference = z.infer<typeof PluginSecretReferenceSchema>;

/**
 * Opaque plugin grants: identifiers and credential formats are owned by bundled definitions.
 * Credentials are opaque SecureStore references; secrets never enter SQLite.
 */
export const pluginAuthorizationTable = sqliteTable(
  'plugin_authorization',
  {
    id: uuidPrimaryKey(),
    pluginId: text().$type<PluginId>().notNull(),
    authMethod: text().notNull(),
    accountLabel: text().notNull(),
    credentialReference: text('credential', { mode: 'json' })
      .$type<PluginSecretReference>()
      .notNull(),
    ...createUpdateTimestamps,
  },
  (t) => [
    check('plugin_authorization_id_check', sql`length(trim(${t.pluginId})) > 0`),
    check('plugin_authorization_method_check', sql`length(trim(${t.authMethod})) > 0`),
  ],
);

export type PluginAuthorizationRow = typeof pluginAuthorizationTable.$inferSelect;
export type InsertPluginAuthorizationRow = typeof pluginAuthorizationTable.$inferInsert;
