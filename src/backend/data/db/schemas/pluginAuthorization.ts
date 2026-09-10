import { sql } from 'drizzle-orm';
import { check, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { PluginCredential, PluginId } from '@/shared/data/types/plugin';

import { createUpdateTimestamps, uuidPrimaryKey } from './_columnHelpers';

/**
 * Opaque plugin grants: identifiers and credential formats are owned by bundled definitions.
 * Storage matches provider API keys and remote MCP headers in this sandboxed database.
 */
export const pluginAuthorizationTable = sqliteTable(
  'plugin_authorization',
  {
    id: uuidPrimaryKey(),
    pluginId: text().$type<PluginId>().notNull(),
    authMethod: text().notNull(),
    accountLabel: text().notNull(),
    credential: text({ mode: 'json' }).$type<PluginCredential>().notNull(),
    ...createUpdateTimestamps,
  },
  (t) => [
    check('plugin_authorization_id_check', sql`length(trim(${t.pluginId})) > 0`),
    check('plugin_authorization_method_check', sql`length(trim(${t.authMethod})) > 0`),
  ],
);

export type PluginAuthorizationRow = typeof pluginAuthorizationTable.$inferSelect;
export type InsertPluginAuthorizationRow = typeof pluginAuthorizationTable.$inferInsert;
