import type { AgentProjection } from '@cherrystudio/remote-protocol/agent';
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { desktopConnectionTable } from './desktopConnection';

export const remoteSessionProjectionTable = sqliteTable(
  'remote_session_projection',
  {
    connectionId: text('connection_id')
      .notNull()
      .references(() => desktopConnectionTable.id, { onDelete: 'cascade' }),
    scopeId: text('scope_id').notNull(),
    sessionId: text('session_id').notNull(),
    streamEpoch: text('stream_epoch').notNull(),
    seq: text().notNull(),
    projection: text({ mode: 'json' }).$type<AgentProjection>().notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.connectionId, table.scopeId, table.sessionId] })],
);

export type RemoteSessionProjectionRow = typeof remoteSessionProjectionTable.$inferSelect;
export type InsertRemoteSessionProjectionRow = typeof remoteSessionProjectionTable.$inferInsert;
