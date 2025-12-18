import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { assistants } from './assistants'
import { createUpdateTimestamps } from './columnHelpers'

export const topics = sqliteTable(
  'topics',
  {
    id: text('id').notNull().unique().primaryKey(),
    assistant_id: text('assistant_id')
      .notNull()
      .references(() => assistants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isLoading: integer('isLoading', { mode: 'boolean' }),
    ...createUpdateTimestamps
  },
  table => [
    index('idx_topics_assistant_id').on(table.assistant_id),
    index('idx_topics_created_at').on(table.created_at),
    index('idx_topics_assistant_id_created_at').on(table.assistant_id, table.created_at)
  ]
)
