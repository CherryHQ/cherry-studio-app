import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type { PluginId } from '@/shared/contracts/plugins';

import { createUpdateTimestamps, uuidPrimaryKey } from './_columnHelpers';
import { pluginAuthorizationTable } from './pluginAuthorization';

/** Stored remote connections and built-in plugin identities. */
export const mcpServerTable = sqliteTable(
  'mcp_server',
  {
    id: uuidPrimaryKey(),
    name: text().notNull(),
    endpointUrl: text('base_url'),
    origin: text().$type<'remote' | 'builtin'>().notNull().default('remote'),
    builtinId: text().$type<PluginId>(),
    authorizationId: text().references(() => pluginAuthorizationTable.id, { onDelete: 'restrict' }),
    headers: text({ mode: 'json' }).$type<Record<string, string>>(),
    isEnabled: integer('is_active', { mode: 'boolean' }).notNull().default(false),
    /**
     * Tool names this server may not offer, as the server reports them. The
     * server decides what exists; this is the user's say over what reaches the
     * model. Names that no longer exist stay put — a tool can come back after
     * an upgrade, and dropping its rule would silently re-enable it.
     */
    disabledTools: text({ mode: 'json' }).$type<string[]>().notNull().default([]),

    ...createUpdateTimestamps,
  },
  (t) => [
    index('mcp_server_is_active_idx').on(t.isEnabled),
    uniqueIndex('mcp_server_builtin_idx').on(t.builtinId),
    check(
      'mcp_server_origin_check',
      sql`(${t.origin} = 'remote' and ${t.endpointUrl} is not null and ${t.builtinId} is null and ${t.authorizationId} is null) or (${t.origin} = 'builtin' and ${t.endpointUrl} is null and ${t.headers} is null and ${t.builtinId} is not null and ${t.authorizationId} is not null)`,
    ),
  ],
);

export type InsertMcpServerRow = typeof mcpServerTable.$inferInsert;
export type McpServerRow = typeof mcpServerTable.$inferSelect;
