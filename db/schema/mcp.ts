import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { createUpdateTimestamps } from './columnHelpers'

export const mcp = sqliteTable('mcp', {
  id: text('id').notNull().unique().primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  description: text('description'),
  is_active: integer('is_active', { mode: 'boolean' }),
  disabled_tools: text('disabled_tools'),
  // External MCP server fields
  base_url: text('base_url'),
  headers: text('headers'), // JSON string
  timeout: integer('timeout'),
  provider: text('provider'),
  provider_url: text('provider_url'),
  logo_url: text('logo_url'),
  tags: text('tags'), // JSON string
  reference: text('reference'),
  disabled_auto_approve_tools: text('disabled_auto_approve_tools'), // JSON string
  is_trusted: integer('is_trusted', { mode: 'boolean' }),
  trusted_at: integer('trusted_at'),
  installed_at: integer('installed_at'),
  ...createUpdateTimestamps
})
