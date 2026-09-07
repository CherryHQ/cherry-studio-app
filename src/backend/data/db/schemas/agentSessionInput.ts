import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { AgentSessionInput } from '@/shared/contracts/agent';

import { createUpdateTimestamps } from './_columnHelpers';
import { agentSessionTable } from './agentSession';

/**
 * Mobile-owned durable input queue. Desktop's renderer-owned draft queue cannot
 * survive mobile process eviction. Consumed/removed rows retain idempotency
 * receipts until Session deletion; only consumed inputs enter the transcript.
 */
export const agentSessionInputTable = sqliteTable(
  'agent_session_input',
  {
    // Client allocates the identity before submission, including retries.
    id: text().primaryKey(),
    sessionId: text()
      .notNull()
      .references(() => agentSessionTable.id, { onDelete: 'cascade' }),
    parts: text({ mode: 'json' }).$type<AgentSessionInput['parts']>().notNull(),
    mode: text().$type<AgentSessionInput['mode']>().notNull(),
    // Keep the requested model identity after model deletion so dequeue can
    // report invalid input instead of silently switching models.
    modelId: text().$type<AgentSessionInput['modelId']>(),
    reasoningEffort: text().$type<AgentSessionInput['reasoningEffort']>(),
    targetTurnId: text(),
    position: integer().notNull(),
    status: text().$type<AgentSessionInput['status']>().notNull().default('queued'),
    reason: text().$type<AgentSessionInput['reason']>(),
    turnId: text(),
    userMessageId: text(),
    assistantMessageId: text(),
    ...createUpdateTimestamps,
  },
  (t) => [
    index('agent_session_input_queue_idx').on(t.sessionId, t.status, t.position),
    check('agent_session_input_mode_check', sql`${t.mode} IN ('follow-up', 'steer')`),
    check('agent_session_input_position_check', sql`${t.position} >= 0`),
    check(
      'agent_session_input_status_check',
      sql`${t.status} IN ('queued', 'dispatching', 'steering', 'consumed', 'interrupted', 'removed')`,
    ),
  ],
);

export type AgentSessionInputRow = typeof agentSessionInputTable.$inferSelect;
export type InsertAgentSessionInputRow = typeof agentSessionInputTable.$inferInsert;
