import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const backup_providers = sqliteTable('backup_providers', {
  id: text('id').primaryKey(),
  name: text('name'),
  config: text('config')
})
