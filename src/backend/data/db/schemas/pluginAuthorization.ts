import { sql } from 'drizzle-orm';
import { check, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { PluginId } from '@/shared/contracts/plugins';

import { createUpdateTimestamps, uuidPrimaryKey } from './_columnHelpers';

/** Native Keychain/Keystore owns the encryption key; SQLite owns the grant. */
export const pluginAuthorizationTable = sqliteTable(
  'plugin_authorization',
  {
    id: uuidPrimaryKey(),
    pluginId: text().$type<PluginId>().notNull(),
    authMethod: text().$type<'personal_token' | 'api_key'>().notNull(),
    accountLabel: text().notNull(),
    credentialCiphertext: text().notNull(),
    credentialKeyId: text().notNull(),
    ...createUpdateTimestamps,
  },
  (t) => [
    check('plugin_authorization_provider_check', sql`${t.pluginId} in ('github', 'amap')`),
    check(
      'plugin_authorization_method_check',
      sql`(${t.pluginId} = 'github' and ${t.authMethod} = 'personal_token') or (${t.pluginId} = 'amap' and ${t.authMethod} = 'api_key')`,
    ),
  ],
);

export type PluginAuthorizationRow = typeof pluginAuthorizationTable.$inferSelect;
export type InsertPluginAuthorizationRow = typeof pluginAuthorizationTable.$inferInsert;
