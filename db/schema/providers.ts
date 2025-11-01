import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { createUpdateTimestamps } from './columnHelpers'

export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  api_key: text('api_key'),
  api_host: text('api_host'),
  api_version: text('api_version'),
  models: text('models'),
  enabled: integer('enabled', { mode: 'boolean' }),
  is_system: integer('is_system', { mode: 'boolean' }),
  is_authed: integer('is_authed', { mode: 'boolean' }),
  rate_limit: integer('rate_limit'),
  is_not_support_array_content: integer('is_not_support_array_content', { mode: 'boolean' }),
  notes: text('notes'),
  ...createUpdateTimestamps
})
