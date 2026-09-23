/**
 * The curated recommendation list bundled with this build.
 *
 * Each entry is a complete package expressed as TypeScript data plus a
 * reviewed compatibility profile bound to the package digest computed at
 * install time. Bundled packages go through the same validation, admission,
 * staging, and publication path as remote packages; bundling only decides the
 * source, never the outcome.
 */

import type { SkillRequirements } from '@/shared/data/types/skill';

import { dailyAgendaSkill } from './dailyAgenda';
import { researchBriefSkill } from './researchBrief';
import { structuredNotesSkill } from './structuredNotes';

export type BundledSkillDefinition = {
  /** Must equal the package `name`. */
  readonly name: string;
  /** Bumped whenever any file changes; the locator stays stable. */
  readonly revision: number;
  /** Package-relative path to UTF-8 text. */
  readonly files: Readonly<Record<string, string>>;
  readonly requirements: SkillRequirements;
  readonly workflowScope: string;
};

export const BUNDLED_SKILLS: readonly BundledSkillDefinition[] = [
  dailyAgendaSkill,
  researchBriefSkill,
  structuredNotesSkill,
];

export function bundledSkillLocator(name: string): string {
  return `bundled:${name}`;
}
