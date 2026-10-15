/**
 * App-owned system workflows. They contribute internal Agent guidance and
 * are never offered as user-installable recommendations.
 */

import type { BuiltInToolCapabilityId } from '@/shared/data/types/builtInTool';

import { parseSkillEntry } from '../skillPackage';
import { dailyAgendaSkill } from './dailyAgenda';
import { researchBriefSkill } from './researchBrief';
import { structuredNotesSkill } from './structuredNotes';

export type BundledSkillDefinition = {
  /** Must equal the package `name`. */
  readonly name: string;
  /** Package-relative path to UTF-8 text. */
  readonly files: Readonly<Record<string, string>>;
  /** Built-in tools the workflow calls; it is offered only when all are present in the turn. */
  readonly requiredTools: readonly BuiltInToolCapabilityId[];
};

export const BUNDLED_SKILLS: readonly BundledSkillDefinition[] = [
  dailyAgendaSkill,
  researchBriefSkill,
  structuredNotesSkill,
];

/** Inline the complete workflow and its resources only when its tools are present. */
export function getSystemSkillInstructions(availableTools: ReadonlyMap<string, string>): string[] {
  return BUNDLED_SKILLS.flatMap((definition) => {
    if (!definition.requiredTools.every((name) => availableTools.has(name))) return [];
    const entry = parseSkillEntry(definition.files['SKILL.md'] ?? '');
    if (!entry || !('body' in entry)) return [];
    const resources = Object.entries(definition.files)
      .filter(([path]) => path !== 'SKILL.md')
      .map(([path, content]) => `#### ${path}\n\n${content.trim()}`);
    let instructions = [
      `### ${definition.name}\n\n${entry.frontmatter.description}`,
      entry.body.trim(),
      ...resources,
    ].join('\n\n');
    for (const name of definition.requiredTools)
      instructions = instructions.replaceAll(`\`${name}\``, `\`${availableTools.get(name)}\``);
    return [instructions];
  });
}
