import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { createUpdateTimestamps, uuidPrimaryKey } from './_columnHelpers';
import { agentTable } from './agent';

/**
 * Durable Agent authorization for an MCP tool source.
 *
 * The built-in identity shape and indexes remain only so existing databases can be
 * read without a destructive migration. Built-in system capabilities are resolved
 * independently by the Host and these legacy rows have no Runtime authority.
 *
 * MCP server ids deliberately are not foreign keys: deleting a server must leave the stable
 * identity, approval policy, and display snapshot available for explicit repair.
 */
export const agentToolBindingTable = sqliteTable(
  'agent_tool_binding',
  {
    id: uuidPrimaryKey(),
    agentId: text()
      .notNull()
      .references(() => agentTable.id, { onDelete: 'cascade' }),
    source: text({ enum: ['builtin', 'mcp'] }).notNull(),
    capabilityId: text(),
    mcpServerId: text(),
    rawToolName: text(),
    enabled: integer({ mode: 'boolean' }).notNull().default(true),
    approval: text({ enum: ['auto', 'ask', 'deny'] })
      .notNull()
      .default('ask'),
    displayNameSnapshot: text(),
    ...createUpdateTimestamps,
  },
  (t) => [
    check(
      'agent_tool_binding_identity_check',
      sql`(
        (${t.source} = 'builtin' AND ${t.capabilityId} IS NOT NULL AND length(${t.capabilityId}) > 0 AND ${t.mcpServerId} IS NULL AND ${t.rawToolName} IS NULL)
        OR
        (${t.source} = 'mcp' AND ${t.capabilityId} IS NULL AND ${t.mcpServerId} IS NOT NULL AND length(${t.mcpServerId}) > 0 AND (${t.rawToolName} IS NULL OR length(${t.rawToolName}) > 0))
      )`,
    ),
    check('agent_tool_binding_approval_check', sql`${t.approval} IN ('auto', 'ask', 'deny')`),
    index('agent_tool_binding_agent_id_idx').on(t.agentId),
    index('agent_tool_binding_mcp_server_id_idx').on(t.mcpServerId),
    uniqueIndex('agent_tool_binding_builtin_uniq')
      .on(t.agentId, t.capabilityId)
      .where(sql`${t.source} = 'builtin'`),
    uniqueIndex('agent_tool_binding_mcp_server_default_uniq')
      .on(t.agentId, t.mcpServerId)
      .where(sql`${t.source} = 'mcp' AND ${t.rawToolName} IS NULL`),
    uniqueIndex('agent_tool_binding_mcp_tool_uniq')
      .on(t.agentId, t.mcpServerId, t.rawToolName)
      .where(sql`${t.source} = 'mcp' AND ${t.rawToolName} IS NOT NULL`),
  ],
);

export type AgentToolBindingRow = typeof agentToolBindingTable.$inferSelect;
export type InsertAgentToolBindingRow = typeof agentToolBindingTable.$inferInsert;
