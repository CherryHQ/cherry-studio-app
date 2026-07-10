import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import type { MessageData, MessageStats, ModelSnapshot } from '@/data/types/message';

import { createUpdateDeleteTimestamps, uuidPrimaryKeyOrdered } from './_columnHelpers';
import { topicTable } from './topic';
import { userModelTable } from './userModel';

/**
 * Message table - stores chat messages with tree structure
 *
 * Uses adjacency list pattern (parentId) for tree navigation. Every topic has
 * exactly one content-less virtual root row (role='root', parentId=null) created
 * eagerly at topic-creation time; all real content is a descendant of it.
 * Part content is stored as JSON in the data field.
 * searchableText is a generated column for FTS5 indexing.
 */
export const messageTable = sqliteTable(
  'message',
  {
    id: uuidPrimaryKeyOrdered(),
    // Adjacency list parent reference for tree structure
    parentId: text(),
    // FK to topic - CASCADE: delete messages when topic is deleted
    topicId: text()
      .notNull()
      .references(() => topicTable.id, { onDelete: 'cascade' }),
    // Message role: user, assistant, system
    role: text().notNull(),
    // Main content - contains parts[] (inline JSON)
    data: text({ mode: 'json' }).$type<MessageData>().notNull(),
    // Searchable text extracted from data.parts (populated by trigger, used for FTS5)
    searchableText: text().notNull().default(''),
    // Final status: SUCCESS, ERROR, PAUSED
    status: text().notNull(),
    // Group ID for siblings (0 = normal branch)
    siblingsGroupId: integer().notNull().default(0),
    // Assistant info is derived via topic -> assistant FK chain; not stored on message.
    // Model identifier: FK to user_model(id) - UniqueModelId "providerId::modelId"
    modelId: text().references(() => userModelTable.id, { onDelete: 'set null' }),
    // Snapshot of model at message creation time
    modelSnapshot: text({ mode: 'json' }).$type<ModelSnapshot>(),
    // Statistics: token usage, performance metrics, etc.
    stats: text({ mode: 'json' }).$type<MessageStats>(),

    // Stable integer surrogate for the FTS5 content_rowid. Local-only physical identity
    // (like rowid): assigned by the AFTER INSERT trigger, never set by app code, never
    // exported in backups. Nullable because the trigger fills it after the row is inserted
    // (a NOT NULL column would reject the row before the trigger runs).
    ftsRowid: integer(),

    ...createUpdateDeleteTimestamps,
  },
  (table) => [
    // Foreign keys. CASCADE (not SET NULL): under the virtual-root pattern, a null parentId
    // is reserved for the topic's single root row (see message_topic_root_uniq below); SET NULL
    // could transiently manufacture a second null-parent row mid-cascade-delete.
    foreignKey({ columns: [table.parentId], foreignColumns: [table.id] }).onDelete('cascade'),
    // Indexes
    index('message_parent_id_idx').on(table.parentId),
    index('message_topic_created_idx').on(table.topicId, table.createdAt),
    // FTS5 content_rowid key (see the fts_rowid column). UNIQUE so its backing index makes the
    // per-row `MAX(fts_rowid)+1` assignment in the FTS INSERT trigger an O(log N) lookup (a bare
    // column would make a bulk migration O(N²)), and rejects any duplicate value loudly.
    uniqueIndex('message_fts_rowid_uniq').on(table.ftsRowid),
    // Single-root invariant: at most one live virtual-root (parentId IS NULL) row per topic.
    // Guarantees one root and backs O(1) root lookup (WHERE topic_id=? AND parent_id IS NULL).
    // Scoped to deleted_at IS NULL so a future soft-delete of a root can't collide with a
    // freshly created one.
    uniqueIndex('message_topic_root_uniq')
      .on(table.topicId)
      .where(sql`${table.parentId} is null and ${table.deletedAt} is null`),
    // Check constraints for enum fields
    check('message_role_check', sql`${table.role} IN ('user', 'assistant', 'system', 'root')`),
    check(
      'message_status_check',
      sql`${table.status} IN ('pending', 'success', 'error', 'paused')`,
    ),
    // Structural role<->null coupling: the virtual root (role='root') is the only row with a
    // null parent, and every content row must have a parent. Makes "content always has a
    // parent" and "root <=> parentId IS NULL" DB invariants, not service-layer discipline.
    check('message_root_parent_check', sql`(${table.role} = 'root') = (${table.parentId} is null)`),
  ],
);

/**
 * FTS5 SQL statements for message full-text search
 *
 * Drizzle does not auto-generate virtual tables or triggers.
 *
 * Architecture:
 * 1. message.fts_rowid - stable integer key for FTS (assigned by trigger; see the column)
 * 2. message.searchable_text - regular column populated by trigger
 * 3. message_fts - FTS5 external-content virtual table keyed on fts_rowid (NOT implicit rowid)
 * 4. Triggers assign fts_rowid and sync both searchable_text and the FTS index
 *
 * Usage:
 * - Keep these statements idempotent. DbService executes them after bundled migrations.
 */

/**
 * Custom SQL statements that Drizzle cannot manage
 * These are executed after every migration via DbService.runCustomMigrations()
 *
 * Virtual tables use IF NOT EXISTS; triggers are DROP + CREATE (not IF NOT EXISTS) so an
 * edited trigger body actually takes effect on databases that already have the old trigger.
 */
export const MESSAGE_FTS_STATEMENTS: string[] = [
  // FTS5 external-content virtual table keyed on the stable `fts_rowid` column, NOT the implicit
  // rowid: the implicit rowid is reshuffled by table rebuilds (drizzle's INSERT...SELECT drops it)
  // and by VACUUM, which would silently desync this index. `fts_rowid` is a real column carried
  // verbatim through rebuilds, so the index stays aligned by construction.
  `CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(
    searchable_text,
    content='message',
    content_rowid='fts_rowid',
    tokenize='trigram'
  )`,

  // Replace old trigger bodies when the searchable-text expression or fts_rowid wiring changes.
  `DROP TRIGGER IF EXISTS message_ai`,
  `DROP TRIGGER IF EXISTS message_ad`,
  `DROP TRIGGER IF EXISTS message_au`,

  // Trigger: assign fts_rowid, populate searchable_text, and sync FTS on INSERT.
  // fts_rowid is assigned here (not by app code) so every insert path is covered; MAX+1 is
  // race-free under withWriteTx serialization and O(log N) via the message_fts_rowid_uniq index.
  // COALESCE wraps group_concat because it returns NULL when no text parts match (e.g. tool-only
  // or empty messages); searchable_text is NOT NULL.
  `CREATE TRIGGER message_ai AFTER INSERT ON message BEGIN
    UPDATE message SET
      fts_rowid = (SELECT COALESCE(MAX(fts_rowid), 0) + 1 FROM message),
      searchable_text = COALESCE((
        SELECT group_concat(json_extract(value, '$.text'), ' ')
        FROM json_each(json_extract(NEW.data, '$.parts'))
        WHERE json_extract(value, '$.type') = 'text'
      ), '')
    WHERE id = NEW.id;
    INSERT INTO message_fts(rowid, searchable_text)
    SELECT fts_rowid, searchable_text FROM message WHERE id = NEW.id;
  END`,

  // Trigger: sync FTS on DELETE
  `CREATE TRIGGER message_ad AFTER DELETE ON message BEGIN
    INSERT INTO message_fts(message_fts, rowid, searchable_text)
    VALUES ('delete', OLD.fts_rowid, OLD.searchable_text);
  END`,

  // Trigger: update searchable_text and sync FTS on UPDATE OF data. fts_rowid is stable across
  // data edits, so it is not reassigned here — only re-keyed delete + re-insert by fts_rowid.
  // COALESCE: see message_ai above for rationale.
  `CREATE TRIGGER message_au AFTER UPDATE OF data ON message BEGIN
    INSERT INTO message_fts(message_fts, rowid, searchable_text)
    VALUES ('delete', OLD.fts_rowid, OLD.searchable_text);
    UPDATE message SET searchable_text = COALESCE((
      SELECT group_concat(json_extract(value, '$.text'), ' ')
      FROM json_each(json_extract(NEW.data, '$.parts'))
      WHERE json_extract(value, '$.type') = 'text'
    ), '') WHERE id = NEW.id;
    INSERT INTO message_fts(rowid, searchable_text)
    SELECT fts_rowid, searchable_text FROM message WHERE id = NEW.id;
  END`,
];

/**
 * Rebuild FTS index (run manually if needed)
 */
// export const REBUILD_FTS_SQL = `INSERT INTO message_fts(message_fts) VALUES ('rebuild')`;

/**
 * Example search query
 */
// export const EXAMPLE_SEARCH_SQL = `
// SELECT m.*
// FROM message m
// JOIN message_fts fts ON m.fts_rowid = fts.rowid
// WHERE message_fts MATCH ?
// ORDER BY rank
// `;

export type InsertMessageRow = typeof messageTable.$inferInsert;
export type MessageRow = typeof messageTable.$inferSelect;
