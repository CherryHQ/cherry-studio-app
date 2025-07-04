import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const files = sqliteTable('files', {
  id: text('id').notNull().unique().primaryKey(),
  origin_name: text('origin_name').notNull(),
  created_at: text('created_at').notNull(),
  name: text('name').notNull(),
  path: text('path').notNull(),
  size: integer('size').notNull(),
  ext: text('ext').notNull(),
  count: integer('count').notNull(),
  type: text('type').notNull(),
  mime_type: text('mime_type').notNull(),
  md5: text('md5').notNull()
})
