import { type AnySQLiteColumn, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { AgentExecutionTarget } from '@/shared/contracts/agent';

import { createUpdateTimestamps, uuidPrimaryKeyOrdered } from './_columnHelpers';
import { agentTable } from './agent';

/**
 * Agent Session table - one long-lived linear conversation
 * (docs/references/agent/agent-persistence.md).
 *
 * No workspace reference: mobile has no working directory or shell
 * environment. No Runtime identity: routing resolves per execution from
 * `executionTarget` inside the Host-owned Router. Sessions hard-delete and
 * cascade their messages; list ordering is recency (`lastActivityAt`), so
 * there is no order key.
 */
export const agentSessionTable = sqliteTable(
  'agent_session',
  {
    id: uuidPrimaryKeyOrdered(),
    // RESTRICT: agents soft-delete first; hard cleanup requires no Sessions.
    agentId: text()
      .notNull()
      .references(() => agentTable.id, { onDelete: 'restrict' }),
    // Protocol vocabulary (AgentSessionView.title), not a second synonym set
    title: text().notNull().default(''),
    // Whether the title was manually edited by user
    titleIsManual: integer({ mode: 'boolean' }).notNull().default(false),
    // Application intent (protocol AgentExecutionTarget), never a Runtime id
    executionTarget: text({ mode: 'json' })
      .$type<AgentExecutionTarget>()
      .notNull()
      .default({ kind: 'local' }),
    // Dedicated conversation activity time: updated only when a submission
    // reserves or an assistant message settles. Renames must not move it.
    lastActivityAt: integer()
      .notNull()
      .$defaultFn(() => Date.now()),
    ...createUpdateTimestamps,
    // Fork provenance (agent-protocol.md "Branching" rule 2). SET NULL, not
    // CASCADE: deleting the source must drop the lineage claim, never the
    // forked Session. Declared last so the column order matches the physical
    // order produced by ALTER TABLE ADD COLUMN.
    forkedFromSessionId: text().references((): AnySQLiteColumn => agentSessionTable.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    index('agent_session_agent_id_idx').on(t.agentId),
    index('agent_session_last_activity_at_idx').on(t.lastActivityAt),
  ],
);

export type AgentSessionRow = typeof agentSessionTable.$inferSelect;
export type InsertAgentSessionRow = typeof agentSessionTable.$inferInsert;
