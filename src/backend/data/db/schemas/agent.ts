import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import {
  createUpdateDeleteTimestamps,
  orderKeyColumns,
  orderKeyIndex,
  uuidPrimaryKey,
} from './_columnHelpers';
import { userModelTable } from './userModel';

/**
 * Inference parameters for an Agent. Backend-local until an Agent API needs a
 * shared DTO (docs/references/agent/agent-persistence.md).
 */
export type AgentSettings = {
  temperature?: number;
  maxOutputTokens?: number;
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
};

/**
 * Agent table - stores user-configured Agent definitions
 * (docs/references/agent/agent-persistence.md).
 *
 * Tool policy and skill references are deliberately absent: Agent tools are an
 * undecided open question (agent/README.md) and V1 executes tool-less turns.
 * Sessions reference agents via FK (ON DELETE RESTRICT); agents soft-delete
 * first, so live Sessions never orphan.
 */
export const agentTable = sqliteTable(
  'agent',
  {
    id: uuidPrimaryKey(),
    name: text().notNull(),
    // Type-level empty: DB DEFAULT is the single source of truth
    description: text().notNull().default(''),
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
