import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { McpConfigSample } from '@/shared/domain/mcpServer';

import { createUpdateTimestamps, uuidPrimaryKey } from './_columnHelpers';

/**
 * MCP Server table - stores user-configured MCP server definitions.
 *
 * This storage schema intentionally mirrors desktop so records can be synced
 * without lossy field mapping. Mobile runtime support remains Streamable HTTP
 * only; unsupported transport rows are retained but filtered by the service.
 */
export const mcpServerTable = sqliteTable(
  'mcp_server',
  {
    id: uuidPrimaryKey(),
    name: text().notNull(),
    type: text(),
    description: text(),
    baseUrl: text(),
    command: text(),
    registryUrl: text(),
    args: text({ mode: 'json' }).$type<string[]>(),
    env: text({ mode: 'json' }).$type<Record<string, string>>(),
    headers: text({ mode: 'json' }).$type<Record<string, string>>(),
    provider: text(),
    providerUrl: text(),
    logoUrl: text(),
    tags: text({ mode: 'json' }).$type<string[]>(),
    longRunning: integer({ mode: 'boolean' }),
    timeout: integer(),
    dxtVersion: text(),
    dxtPath: text(),
    reference: text(),
    searchKey: text(),
    configSample: text({ mode: 'json' }).$type<McpConfigSample>(),
    disabledTools: text({ mode: 'json' }).$type<string[]>(),
    disabledAutoApproveTools: text({ mode: 'json' }).$type<string[]>(),
    shouldConfig: integer({ mode: 'boolean' }),
    sortOrder: integer().default(0),
    isActive: integer({ mode: 'boolean' }).notNull().default(false),
    installSource: text(),
    isTrusted: integer({ mode: 'boolean' }),
    trustedAt: integer(),
    installedAt: integer(),

    ...createUpdateTimestamps,
  },
  (table) => [
    index('mcp_server_name_idx').on(table.name),
    index('mcp_server_is_active_idx').on(table.isActive),
    index('mcp_server_sort_order_idx').on(table.sortOrder),
    check(
      'mcp_server_type_check',
      sql`${table.type} IS NULL OR ${table.type} IN ('stdio', 'sse', 'streamableHttp', 'inMemory')`,
    ),
    check(
      'mcp_server_install_source_check',
      sql`${table.installSource} IS NULL OR ${table.installSource} IN ('builtin', 'manual', 'protocol', 'unknown')`,
    ),
  ],
);

export type InsertMcpServerRow = typeof mcpServerTable.$inferInsert;
export type McpServerRow = typeof mcpServerTable.$inferSelect;
