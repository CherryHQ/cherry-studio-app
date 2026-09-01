import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { AgentToolApprovalMode } from '@/shared/data/types/agent';

import {
  createUpdateDeleteTimestamps,
  orderKeyColumns,
  orderKeyIndex,
  uuidPrimaryKey,
} from './_columnHelpers';
import { userModelTable } from './userModel';

/**
 * Agent table - stores user-configured Agent definitions
 * (docs/references/agent/agent-persistence.md).
 *
 * Per-Agent MCP availability is normalized in `agent_tool_binding`; the broad
 * interactive approval preference lives on this row. Agent CRUD never rewrites
 * the binding relation. The fixed built-in Runtime catalog is Host-owned and is
 * not stored on this row. Skill references remain deferred.
 * Sessions reference agents via FK (ON DELETE RESTRICT); agents soft-delete
 * first, so live Sessions never orphan.
 */
export const agentTable = sqliteTable(
  'agent',
  {
    id: uuidPrimaryKey(),
    name: text().notNull(),
    // System instructions supplied to every turn
    instructions: text().notNull().default(''),
    // Stable avatar file reference (agent-avatar-file:{agentId}.{uuid}.webp);
    // NULL renders the default avatar. Never an absolute file:// path.
    avatar: text(),
    // Default model: FK to user_model(id) — UniqueModelId "providerId::modelId"
    // Legitimately nullable: NULL = "no model selected yet"
    modelId: text().references(() => userModelTable.id, { onDelete: 'set null' }),
    // Per-Agent interactive approval preference. This does not enable tools.
    toolApprovalMode: text({ enum: ['default', 'auto'] })
      .$type<AgentToolApprovalMode>()
      .notNull()
      .default('default'),
    // Capability-group deny-list (aligned with desktop's disabled_tools JSON
    // pattern): a group id absent from the list is enabled. Stores group ids,
    // never tool names; reads sanitize unknown ids instead of failing.
    disabledCapabilities: text({ mode: 'json' }).$type<string[]>().notNull().default([]),
    ...orderKeyColumns,
    ...createUpdateDeleteTimestamps,
  },
  (t) => [index('agent_created_at_idx').on(t.createdAt), orderKeyIndex('agent')(t)],
);

export type AgentRow = typeof agentTable.$inferSelect;
export type InsertAgentRow = typeof agentTable.$inferInsert;
