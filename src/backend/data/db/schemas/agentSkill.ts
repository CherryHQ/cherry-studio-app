import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { createUpdateTimestamps } from './_columnHelpers';
import { agentTable } from './agent';
import { agentGlobalSkillTable } from './agentGlobalSkill';

/**
 * One Agent's use of one installed Skill. No row means unbound: Agents never
 * inherit the library implicitly. Global disable hides the Skill from every
 * Agent while preserving these per-Agent preferences for later re-enablement.
 * Deleting either side removes the join; the package is never copied.
 */
export const agentSkillTable = sqliteTable(
  'agent_skill',
  {
    agentId: text()
      .notNull()
      .references(() => agentTable.id, { onDelete: 'cascade' }),
    skillId: text()
      .notNull()
      .references(() => agentGlobalSkillTable.id, { onDelete: 'cascade' }),
    isEnabled: integer({ mode: 'boolean' }).notNull().default(true),
    ...createUpdateTimestamps,
  },
  (t) => [
    primaryKey({ columns: [t.agentId, t.skillId] }),
    index('agent_skill_skill_id_idx').on(t.skillId),
  ],
);

export type AgentSkillRow = typeof agentSkillTable.$inferSelect;
export type InsertAgentSkillRow = typeof agentSkillTable.$inferInsert;
