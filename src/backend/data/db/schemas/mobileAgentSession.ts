/**
 * Mobile Agent Host persistence (docs/references/agent/agent-protocol.md).
 *
 * These tables are mobile-owned: they back the Agent Protocol's Sessions,
 * turns, messages, and approvals. They are deliberately prefixed
 * `mobile_agent_` so they can never collide with the desktop-aligned agent
 * domain (`agent`, `agent_session`, ... from desktop `src/main/ai/agentSession`),
 * which is not migrated to mobile yet and remains free to claim its desktop
 * table names later.
 *
 * JSON columns store protocol-shaped values (`AgentMessagePart[]`,
 * `AgentUsageView`, `AgentErrorView`); the persistence service re-validates
 * them at the read boundary.
 */

import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type {
  AgentErrorView,
  AgentMessagePart,
  AgentUsageView,
  JsonValue,
} from '@/shared/contracts/agent';

import { createUpdateTimestamps, uuidPrimaryKey } from './_columnHelpers';

export const mobileAgentSessionTable = sqliteTable('mobile_agent_session', {
  id: uuidPrimaryKey(),
  agentId: text().notNull(),
  /** AgentExecutionTarget.kind; version 1 stores only 'local'. */
  executionTargetKind: text().notNull().default('local'),
  title: text().notNull().default(''),
  titleIsManual: integer({ mode: 'boolean' }).notNull().default(false),
  ...createUpdateTimestamps,
});

export const mobileAgentTurnTable = sqliteTable(
  'mobile_agent_turn',
  {
    id: uuidPrimaryKey(),
    sessionId: text()
      .notNull()
      .references(() => mobileAgentSessionTable.id, { onDelete: 'cascade' }),
    status: text()
      .notNull()
      .$type<
        | 'running'
        | 'awaiting-approval'
        | 'cancelling'
        | 'completed'
        | 'failed'
        | 'cancelled'
        | 'interrupted'
      >(),
    assistantMessageId: text().notNull(),
    error: text({ mode: 'json' }).$type<AgentErrorView>(),
    startedAt: integer().notNull(),
    endedAt: integer(),
    ...createUpdateTimestamps,
  },
  (t) => [
    index('mobile_agent_turn_session_id_idx').on(t.sessionId),
    // Startup reconciliation scans for non-terminal turns.
    index('mobile_agent_turn_status_idx').on(t.status),
  ],
);

export const mobileAgentMessageTable = sqliteTable(
  'mobile_agent_message',
  {
    id: uuidPrimaryKey(),
    sessionId: text()
      .notNull()
      .references(() => mobileAgentSessionTable.id, { onDelete: 'cascade' }),
    turnId: text(),
    role: text().notNull().$type<'user' | 'assistant' | 'system'>(),
    status: text()
      .notNull()
      .$type<'pending' | 'streaming' | 'success' | 'error' | 'cancelled' | 'interrupted'>(),
    parts: text({ mode: 'json' }).$type<AgentMessagePart[]>().notNull().default([]),
    usage: text({ mode: 'json' }).$type<AgentUsageView>(),
    ...createUpdateTimestamps,
  },
  (t) => [index('mobile_agent_message_session_id_created_at_idx').on(t.sessionId, t.createdAt)],
);

export const mobileAgentApprovalTable = sqliteTable(
  'mobile_agent_approval',
  {
    /** Approval ids are runtime-issued, not auto-generated. */
    id: text().primaryKey(),
    sessionId: text()
      .notNull()
      .references(() => mobileAgentSessionTable.id, { onDelete: 'cascade' }),
    turnId: text().notNull(),
    toolCallId: text().notNull(),
    toolName: text().notNull(),
    input: text({ mode: 'json' }).$type<JsonValue>().notNull(),
    status: text().notNull().$type<'pending' | 'approved' | 'denied'>(),
    ...createUpdateTimestamps,
  },
  (t) => [index('mobile_agent_approval_turn_id_idx').on(t.turnId)],
);

export type MobileAgentSessionRow = typeof mobileAgentSessionTable.$inferSelect;
export type InsertMobileAgentSessionRow = typeof mobileAgentSessionTable.$inferInsert;
export type MobileAgentTurnRow = typeof mobileAgentTurnTable.$inferSelect;
export type InsertMobileAgentTurnRow = typeof mobileAgentTurnTable.$inferInsert;
export type MobileAgentMessageRow = typeof mobileAgentMessageTable.$inferSelect;
export type InsertMobileAgentMessageRow = typeof mobileAgentMessageTable.$inferInsert;
export type MobileAgentApprovalRow = typeof mobileAgentApprovalTable.$inferSelect;
export type InsertMobileAgentApprovalRow = typeof mobileAgentApprovalTable.$inferInsert;
