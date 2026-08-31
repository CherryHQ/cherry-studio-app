import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { createUpdateTimestamps, uuidPrimaryKey } from './_columnHelpers';

/**
 * MCP Server table - remote Streamable HTTP endpoints this client connects to.
 *
 * Mobile is an MCP *client* only, and the only transport it accepts is
 * Streamable HTTP, so `endpointUrl` plus optional request `headers` are the
 * connection config. Everything else the protocol needs is negotiated per
 * connection. There is deliberately no `type` column: a single accepted
 * transport is a constant, not a stored value.
 *
 * Runtime facts (protocol version, server info, tool list, connection state)
 * are re-derived on every connection and belong to `McpRuntimeService`, not
 * here. Execution approval is fixed application policy — every MCP tool asks
 * before it runs — so there is no per-server approval column. OAuth credentials
 * with refresh semantics get their own storage keyed by server id; static HTTP
 * credentials remain in `headers`, matching desktop's MCP server contract.
 */
export const mcpServerTable = sqliteTable(
  'mcp_server',
  {
    id: uuidPrimaryKey(),
    name: text().notNull(),
    endpointUrl: text().notNull(),
    headers: text({ mode: 'json' }).$type<Record<string, string>>(),
    isEnabled: integer({ mode: 'boolean' }).notNull().default(false),
    /**
     * Tool names this server may not offer, as the server reports them. The
     * server decides what exists; this is the user's say over what reaches the
     * model. Names that no longer exist stay put — a tool can come back after
     * an upgrade, and dropping its rule would silently re-enable it.
     */
    disabledTools: text({ mode: 'json' }).$type<string[]>().notNull().default([]),

    ...createUpdateTimestamps,
  },
  (t) => [index('mcp_server_is_enabled_idx').on(t.isEnabled)],
);

export type InsertMcpServerRow = typeof mcpServerTable.$inferInsert;
export type McpServerRow = typeof mcpServerTable.$inferSelect;
