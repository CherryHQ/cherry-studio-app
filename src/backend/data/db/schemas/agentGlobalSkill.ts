import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type {
  SkillInvocation,
  SkillManifestEntry,
  SkillProfile,
  SkillSource,
} from '@/shared/data/types/skill';

import { createUpdateDeleteTimestamps, uuidPrimaryKey } from './_columnHelpers';

/**
 * The installed Skill library (docs/references/agent/agent-skills.md).
 *
 * One row is one app-owned installation shared by every bound Agent. The row
 * keeps source attribution, the accepted revision, the whole-package digest,
 * the resource manifest, and the version-bound compatibility profile together.
 * Global enablement is user intent; current availability is derived per read
 * and is deliberately not a column. Package bytes live under the managed Skill
 * directory at `<root>/Data/Skills/<folder_name>/revisions/<package_digest>/`;
 * only the stable alias and digest are persisted, never a sandbox path.
 *
 * Uninstall tombstones the row before physical cleanup so searches and loads
 * stop immediately; historical activity keeps referencing the id.
 */
export const agentGlobalSkillTable = sqliteTable(
  'agent_global_skill',
  {
    id: uuidPrimaryKey(),
    name: text().notNull(),
    description: text().notNull(),
    // Generated storage alias; unique among live rows so two publishers can
    // share a display name without sharing a directory.
    folderName: text().notNull(),
    sourceRegistry: text({ enum: ['bundled', 'github', 'clawhub'] })
      .$type<SkillSource['registry']>()
      .notNull(),
    // Stable origin identity; updates preserve it and uninstall retires the row.
    sourceLocator: text().notNull(),
    sourceUrl: text(),
    sourceRevision: text().notNull(),
    author: text(),
    version: text(),
    license: text(),
    compatibility: text(),
    tags: text({ mode: 'json' }).$type<string[]>().notNull().default([]),
    // SHA-256 of SKILL.md alone, retained for desktop-aligned change detection.
    entryDigest: text().notNull(),
    // SHA-256 over the sorted manifest (path + content digest); admission binds to this.
    packageDigest: text().notNull(),
    manifest: text({ mode: 'json' }).$type<SkillManifestEntry[]>().notNull(),
    profile: text({ mode: 'json' }).$type<SkillProfile>().notNull(),
    invocation: text({ mode: 'json' })
      .$type<SkillInvocation>()
      .notNull()
      .default({ modelInvocable: true, userInvocable: true }),
    isGlobalEnabled: integer({ mode: 'boolean' }).notNull().default(true),
    ...createUpdateDeleteTimestamps,
  },
  (t) => [
    check('agent_global_skill_name_check', sql`length(${t.name}) > 0`),
    check('agent_global_skill_folder_check', sql`length(${t.folderName}) > 0`),
    check('agent_global_skill_locator_check', sql`length(${t.sourceLocator}) > 0`),
    uniqueIndex('agent_global_skill_folder_name_uniq')
      .on(t.folderName)
      .where(sql`${t.deletedAt} IS NULL`),
    uniqueIndex('agent_global_skill_source_locator_uniq')
      .on(t.sourceLocator)
      .where(sql`${t.deletedAt} IS NULL`),
    index('agent_global_skill_name_idx').on(t.name),
    index('agent_global_skill_enabled_idx').on(t.isGlobalEnabled, t.deletedAt),
  ],
);

export type AgentGlobalSkillRow = typeof agentGlobalSkillTable.$inferSelect;
export type InsertAgentGlobalSkillRow = typeof agentGlobalSkillTable.$inferInsert;
