import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { createUpdateTimestamps, uuidPrimaryKey } from './_columnHelpers';

/**
 * MCP Server table - remote Streamable HTTP endpoints this client connects to.
 *
 * Mobile is an MCP *client* only, and the only transport it accepts is
 * Streamable HTTP, so `endpointUrl` is the whole of the connection config —
 * everything else the protocol needs is negotiated per connection. There is
 * deliberately no `type` column: a single accepted transport is a constant, not
 * a stored value.
 *
 * Runtime facts (protocol version, server info, tool list, connection state)
 * are re-derived on every connection and belong to `McpRuntimeService`, not
 * here. Tool availability and execution approval are fixed application policy,
 * not per-server configuration. Future OAuth credentials get their own
 * storage keyed by server id; they must never land in this table.
 */
export const mcpServerTable = sqliteTable(
  'mcp_server',
  {
    id: uuidPrimaryKey(),
    name: text().notNull(),
    endpointUrl: text().notNull(),
    isEnabled: integer({ mode: 'boolean' }).notNull().default(false),

    ...createUpdateTimestamps,
  },
  (t) => [index('mcp_server_is_enabled_idx').on(t.isEnabled)],
);

export type InsertMcpServerRow = typeof mcpServerTable.$inferInsert;
export type McpServerRow = typeof mcpServerTable.$inferSelect;
