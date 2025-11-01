import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { createUpdateTimestamps } from './columnHelpers'

export const files = sqliteTable('files', {
  id: text('id').notNull().unique().primaryKey(),
  origin_name: text('origin_name').notNull(),
  name: text('name').notNull(),
  path: text('path').notNull(),
  size: integer('size').notNull(),
  ext: text('ext').notNull(),
  count: integer('count').notNull(),
  type: text('type').notNull(),
  ...createUpdateTimestamps
})
