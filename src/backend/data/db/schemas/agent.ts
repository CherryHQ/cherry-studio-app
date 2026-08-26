import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { AgentSettings } from '@/shared/data/types/agent';

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
 * Tool policy and skill references are deliberately absent: per-Agent tool
 * bindings are an undecided open question (agent/README.md), and the built-in
 * catalog the Host resolves per turn is the same for every Agent.
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
    // JSON blob: inference params; creation supplies the product default
    settings: text({ mode: 'json' }).$type<AgentSettings>().notNull(),
    ...orderKeyColumns,
    ...createUpdateDeleteTimestamps,
  },
  (t) => [index('agent_created_at_idx').on(t.createdAt), orderKeyIndex('agent')(t)],
);

export type AgentRow = typeof agentTable.$inferSelect;
export type InsertAgentRow = typeof agentTable.$inferInsert;
