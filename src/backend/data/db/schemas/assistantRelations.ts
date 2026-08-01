import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { createUpdateTimestamps } from './_columnHelpers';
import { assistantTable } from './assistant';
import { mcpServerTable } from './mcpServer';

// NOTE: assistant-model relationship is 1:1 (default model) stored as assistant.modelId.
// Multi-model (@mention) list is ephemeral UI state stored in persist-cache.

/**
 * Assistant-McpServer junction table
 *
 * Associates assistants with MCP servers. Both sides CASCADE on deletion.
 */
export const assistantMcpServerTable = sqliteTable(
  'assistant_mcp_server',
  {
    assistantId: text()
      .notNull()
      .references(() => assistantTable.id, { onDelete: 'cascade' }),
    mcpServerId: text()
      .notNull()
      .references(() => mcpServerTable.id, { onDelete: 'cascade' }),
    ...createUpdateTimestamps,
  },
  (table) => [primaryKey({ columns: [table.assistantId, table.mcpServerId] })],
);

/**
 * Assistant-KnowledgeBase junction table
 *
 * Associates assistants with knowledge bases.
 * Both sides CASCADE on assistant deletion; knowledge FK is omitted until
 * mobile migrates the knowledge schema.
 */
export const assistantKnowledgeBaseTable = sqliteTable(
  'assistant_knowledge_base',
  {
    assistantId: text()
      .notNull()
      .references(() => assistantTable.id, { onDelete: 'cascade' }),
    knowledgeBaseId: text().notNull(),
    ...createUpdateTimestamps,
  },
  (table) => [primaryKey({ columns: [table.assistantId, table.knowledgeBaseId] })],
);

export type InsertAssistantKnowledgeBaseRow = typeof assistantKnowledgeBaseTable.$inferInsert;
export type AssistantKnowledgeBaseRow = typeof assistantKnowledgeBaseTable.$inferSelect;
export type InsertAssistantMcpServerRow = typeof assistantMcpServerTable.$inferInsert;
export type AssistantMcpServerRow = typeof assistantMcpServerTable.$inferSelect;
