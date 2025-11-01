import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { createUpdateTimestamps } from './columnHelpers'

export const mcp = sqliteTable('mcp', {
  id: text('id').notNull().unique().primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  description: text('description'),
  is_active: integer('is_active', { mode: 'boolean' }),
  disabled_tools: text('disabled_tools'),
  ...createUpdateTimestamps
})
