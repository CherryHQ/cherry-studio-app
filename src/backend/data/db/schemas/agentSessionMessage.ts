import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type {
  AgentErrorView,
  AgentInferenceSnapshotV1,
  AgentMessagePart,
  AgentUsageView,
  JsonValue,
} from '@/shared/contracts/agent';

import { createUpdateTimestamps, uuidPrimaryKeyOrdered } from './_columnHelpers';
import { agentSessionTable } from './agentSession';
import { userModelTable } from './userModel';

/**
 * Versioned message content envelope. The parts are exactly the protocol's
 * `AgentMessagePart` union; the version field guards future part-shape
 * migrations (docs/references/agent/agent-persistence.md).
 */
export type AgentMessageData = {
  version: 1;
  parts: AgentMessagePart[];
};

/**
 * Agent Session Message table - one row per linear transcript entry
 * (docs/references/agent/agent-persistence.md).
 *
 * There is no message tree and no turn table: `turnId` is the correlation id
 * shared by a submission's user/assistant pair, and the Host projects
 * `AgentTurnView` from the assistant row plus its live in-memory state.
 * searchableText is a plain column populated by triggers for FTS5 indexing;
 * see AGENT_SESSION_MESSAGE_FTS_STATEMENTS below.
 */
export const agentSessionMessageTable = sqliteTable(
  'agent_session_message',
  {
    id: uuidPrimaryKeyOrdered(),
    // FK to agent_session - CASCADE: delete messages when the session is deleted
    sessionId: text()
      .notNull()
      .references(() => agentSessionTable.id, { onDelete: 'cascade' }),
    // Correlation id for one submission; nullable per protocol (system rows)
    turnId: text(),
    // Message role: user, assistant, system — no 'root', the transcript is linear
    role: text().notNull(),
    // Main content - versioned protocol parts (inline JSON)
    data: text({ mode: 'json' }).$type<AgentMessageData>().notNull(),
    // Protocol message lifecycle status
    status: text().notNull(),
    // Token usage; assistant messages only, committed at settle time
    usage: text({ mode: 'json' }).$type<AgentUsageView>(),
    // Turn-level error persisted beside the message for the Host's Turn
    // projection; it is not part of the protocol message view.
    error: text({ mode: 'json' }).$type<AgentErrorView>(),
    // Runtime-owned opaque context artifact. The Host validates its version,
    // anchor, and byte size before saving or replaying it.
    contextCheckpoint: text({ mode: 'json' }).$type<unknown>(),
    // Model identifier: FK to user_model(id) — UniqueModelId "providerId::modelId"
    modelId: text().references(() => userModelTable.id, { onDelete: 'set null' }),
    // Versioned Agent inference snapshot. Keep raw JSON so unknown future
    // versions can be projected as unsupported without losing the message.
    messageSnapshot: text({ mode: 'json' }).$type<AgentInferenceSnapshotV1 | JsonValue>(),
    // Searchable text extracted from data.parts (populated by trigger, used for FTS5)
    searchableText: text().notNull().default(''),
    // Stable integer surrogate for the FTS5 content_rowid: trigger-assigned,
    // local-only, and nullable because the AFTER INSERT trigger fills it.
    ftsRowid: integer(),
    ...createUpdateTimestamps,
  },
  (t) => [
    index('agent_session_message_session_created_idx').on(t.sessionId, t.createdAt),
    index('agent_session_message_turn_id_idx').on(t.turnId),
    // Backs boot reconciliation of unsettled messages. Plain, not partial —
    // Drizzle binds `status = ?`, which SQLite can't match to a partial index.
    index('agent_session_message_status_idx').on(t.status),
    // Invariant 1 (agent-protocol.md): at most one active turn per Session is
    // a database constraint — a concurrent second reservation fails to insert.
    uniqueIndex('agent_session_message_active_turn_uniq')
      .on(t.sessionId)
      .where(sql`${t.role} = 'assistant' and ${t.status} in ('pending', 'streaming')`),
    // FTS5 content_rowid key — UNIQUE so its index keeps the per-row
    // MAX(fts_rowid)+1 assignment O(log N) (see ftsRowid and FTS SQL below).
    uniqueIndex('agent_session_message_fts_rowid_uniq').on(t.ftsRowid),
    check('agent_session_message_role_check', sql`${t.role} IN ('user', 'assistant', 'system')`),
    check(
      'agent_session_message_status_check',
      sql`${t.status} IN ('pending', 'streaming', 'success', 'error', 'cancelled', 'interrupted')`,
    ),
  ],
);

export type AgentSessionMessageRow = typeof agentSessionMessageTable.$inferSelect;
export type InsertAgentSessionMessageRow = typeof agentSessionMessageTable.$inferInsert;

/**
 * FTS5 SQL statements for agent session message full-text search.
 *
 * Drizzle does not manage virtual tables or triggers, so these run through
 * `customSql.ts` after migrations. The index is keyed on the stable
 * `fts_rowid` column (NOT the implicit rowid, which a table rebuild or VACUUM
 * would reshuffle).
 *
 * Only `text` parts are indexed — NOT `reasoning` (model-internal, the UI does
 * not render it in search) and NOT tool payloads (structured data, not prose).
 */
const searchableTextExpression = (dataExpression: string) => `COALESCE((
  SELECT group_concat(text, char(10))
  FROM (
    SELECT json_extract(value, '$.text') AS text
    FROM json_each(json_extract(${dataExpression}, '$.parts'))
    WHERE json_extract(value, '$.type') = 'text'
      AND json_extract(value, '$.text') IS NOT NULL
      AND trim(json_extract(value, '$.text')) != ''
  )
), '')`;

export const AGENT_SESSION_MESSAGE_FTS_STATEMENTS: string[] = [
  `CREATE VIRTUAL TABLE IF NOT EXISTS agent_session_message_fts USING fts5(
    searchable_text,
    content='agent_session_message',
    content_rowid='fts_rowid',
    tokenize='trigram'
  )`,

  // DROP+CREATE so trigger-body changes take effect on existing DBs.
  `DROP TRIGGER IF EXISTS agent_session_message_ai`,
  `DROP TRIGGER IF EXISTS agent_session_message_ad`,
  `DROP TRIGGER IF EXISTS agent_session_message_au`,

  // Trigger: assign fts_rowid, populate searchable_text, and sync FTS on
  // INSERT. MAX+1 is race-free under withWriteTx serialization and O(log N)
  // via agent_session_message_fts_rowid_uniq.
  `CREATE TRIGGER agent_session_message_ai AFTER INSERT ON agent_session_message BEGIN
    UPDATE agent_session_message SET
      fts_rowid = (SELECT COALESCE(MAX(fts_rowid), 0) + 1 FROM agent_session_message),
      searchable_text = ${searchableTextExpression('NEW.data')}
    WHERE id = NEW.id;
    INSERT INTO agent_session_message_fts(rowid, searchable_text)
    SELECT fts_rowid, searchable_text FROM agent_session_message WHERE id = NEW.id;
  END`,

  // Trigger: sync FTS on DELETE
  `CREATE TRIGGER agent_session_message_ad AFTER DELETE ON agent_session_message BEGIN
    INSERT INTO agent_session_message_fts(agent_session_message_fts, rowid, searchable_text)
    VALUES ('delete', OLD.fts_rowid, OLD.searchable_text);
  END`,

  // Trigger: update searchable_text and sync FTS on UPDATE OF data. fts_rowid
  // is stable across data edits — only re-keyed delete + re-insert.
  `CREATE TRIGGER agent_session_message_au AFTER UPDATE OF data ON agent_session_message BEGIN
    INSERT INTO agent_session_message_fts(agent_session_message_fts, rowid, searchable_text)
    VALUES ('delete', OLD.fts_rowid, OLD.searchable_text);
    UPDATE agent_session_message SET searchable_text = ${searchableTextExpression('NEW.data')} WHERE id = NEW.id;
    INSERT INTO agent_session_message_fts(rowid, searchable_text)
    SELECT fts_rowid, searchable_text FROM agent_session_message WHERE id = NEW.id;
  END`,
];
