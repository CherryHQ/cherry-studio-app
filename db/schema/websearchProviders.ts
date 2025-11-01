import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { createUpdateTimestamps } from './columnHelpers'

export const websearch_providers = sqliteTable('websearch_providers', {
  id: text('id').primaryKey(),
  name: text('name'),
  api_key: text('api_key'),
  api_host: text('api_host'),
  engines: text('engines'),
  url: text('url'),
  basic_auth_username: text('basic_auth_username'),
  basic_auth_password: text('basic_auth_password'),
  content_limit: integer('content_limit'),
  using_browser: integer('using_browser', { mode: 'boolean' }),
  ...createUpdateTimestamps
})
