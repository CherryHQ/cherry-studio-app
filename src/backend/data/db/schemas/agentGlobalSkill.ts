import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type {
  SkillInvocation,
  SkillManifestEntry,
  SkillProfile,
  SkillSourceKind,
} from '@/shared/data/types/skill';

import { createUpdateTimestamps, uuidPrimaryKey } from './_columnHelpers';

/**
 * The installed Skill library (docs/references/agent/agent-skills.md).
 *
 * Columns through `isEnabled` match desktop's `agent_global_skill`, including
 * the `directory-sha256:` content hash. Desktop's `namespace` is absent: mobile
 * has no built-in namespaces or system skill placements. Three mobile columns
 * follow: `manifest` lists the accepted files for backup completeness and
 * package-local reads, `profile` holds the requirements admission evaluates on
 * every read without opening packages, and `invocation` lets list queries
 * filter by the package's invocation policy.
 *
 * Package bytes live at `Data/Skills/<folder_name>/<hash hex>/`;
 * only the folder name and hash are persisted, never a sandbox path.
 */
export const agentGlobalSkillTable = sqliteTable(
  'agent_global_skill',
  {
    id: uuidPrimaryKey(),
    name: text().notNull(),
    description: text(),
    folderName: text().notNull(),
    source: text().$type<SkillSourceKind>().notNull(),
    sourceUrl: text(),
    author: text(),
    version: text(),
    tags: text({ mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    contentHash: text().notNull(),
    isEnabled: integer({ mode: 'boolean' }).notNull().default(false),
    manifest: text({ mode: 'json' }).$type<SkillManifestEntry[]>().notNull(),
    profile: text({ mode: 'json' }).$type<SkillProfile>().notNull(),
    invocation: text({ mode: 'json' })
      .$type<SkillInvocation>()
      .notNull()
      .default({ modelInvocable: true, userInvocable: true }),
    ...createUpdateTimestamps,
  },
  (t) => [
    uniqueIndex('agent_global_skill_folder_name_unique').on(t.folderName),
    index('agent_global_skill_source_idx').on(t.source),
    index('agent_global_skill_is_enabled_idx').on(t.isEnabled),
  ],
);

export type AgentGlobalSkillRow = typeof agentGlobalSkillTable.$inferSelect;
export type InsertAgentGlobalSkillRow = typeof agentGlobalSkillTable.$inferInsert;
