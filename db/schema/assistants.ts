import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { createUpdateTimestamps } from './columnHelpers'

export const assistants = sqliteTable('assistants', {
  id: text('id').notNull().unique().primaryKey(),
  name: text('name').notNull(),
  prompt: text('prompt').notNull(),
  // knowledgeIds: text('knowledge_ids'),
  // todo add foreign key
  // .references(() => knowledges.id),
  type: text('type').notNull().default('built_in'),
  emoji: text('emoji'),
  description: text('description'),
  model: text('model'),
  default_model: text('default_model'),
  settings: text('settings'),
  enable_web_search: integer('enable_web_search', { mode: 'boolean' }),
  enable_generate_image: integer('enable_generate_image', { mode: 'boolean' }),
  mcp_servers: text('mcp_servers'),
  knowledge_recognition: text('knowledge_recognition'),
  tags: text('tags'),
  group: text('group'),
  websearch_provider_id: text('websearch_provider_id'),
  ...createUpdateTimestamps
})
