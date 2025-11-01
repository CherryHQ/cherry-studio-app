import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { assistants } from './assistants'
import { createUpdateTimestamps } from './columnHelpers'
import { topics } from './topics'

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').notNull().unique().primaryKey(),
    role: text('role').notNull(),
    assistant_id: text('assistant_id')
      .notNull()
      .references(() => assistants.id),
    topic_id: text('topic_id')
      .notNull()
      .references(() => topics.id),
    status: text('status').notNull(),
    model_id: text('model_id'),
    model: text('model'),
    type: text('type'),
    useful: integer('useful', { mode: 'boolean' }),
    ask_id: text('ask_id'),
    mentions: text('mentions'),
    usage: text('usage'),
    metrics: text('metrics'),
    multi_model_message_style: text('multi_model_message_style'),
    fold_selected: integer('fold_selected', { mode: 'boolean' }),
    ...createUpdateTimestamps
  },
  table => [
    index('idx_messages_topic_id').on(table.topic_id),
    index('idx_messages_assistant_id').on(table.assistant_id)
  ]
)
