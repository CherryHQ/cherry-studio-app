import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { createUpdateTimestamps, uuidPrimaryKey } from './_columnHelpers';

/**
 * MCP server table schema
 *
 * Mobile only supports remote Streamable HTTP servers, so the desktop schema's
 * stdio/inMemory fields (command/args/env/registryUrl/dxt*) are omitted and the
 * transport type is implicit.
 */
export const mcpServerTable = sqliteTable(
  'mcp_server',
  {
    id: uuidPrimaryKey(),

    name: text().notNull(),

    description: text().notNull().default(''),

    /** Remote Streamable HTTP endpoint URL */
    baseUrl: text().notNull(),

    /** Static request headers (e.g. Authorization) */
    headers: text({ mode: 'json' }).$type<Record<string, string>>(),

    /** Tool-call timeout in seconds (null = 60s default) */
    timeout: integer(),

    /** Tool names excluded from injection (blacklist) */
    disabledTools: text({ mode: 'json' }).$type<string[]>(),

    /** Tool names requiring user approval — reserved until the approval flow lands */
    disabledAutoApproveTools: text({ mode: 'json' }).$type<string[]>(),

    isActive: integer({ mode: 'boolean' }).notNull().default(true),

    ...createUpdateTimestamps,
  },
  (table) => [
    index('mcp_server_is_active_idx').on(table.isActive),
    index('mcp_server_name_idx').on(table.name),
  ],
);

export type InsertMcpServerRow = typeof mcpServerTable.$inferInsert;
export type McpServerRow = typeof mcpServerTable.$inferSelect;
