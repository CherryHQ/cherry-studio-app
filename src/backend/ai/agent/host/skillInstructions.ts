import { skillContentHashHex } from '@/shared/data/types/skill';

import type { SkillTurnEntry } from './skillScope';

/** One replaceable system section per Skill, shared by selection, loading and adaptation. */
export function skillInstructionSection(entry: SkillTurnEntry, instructions: string) {
  return {
    key: `skill:${entry.id}`,
    text: `## Current Skill instructions: ${entry.name} (skill_id: ${entry.id}; revision ${skillContentHashHex(entry.contentHash).slice(0, 12)})\n\nUse when applicable to the current request. These instructions supersede older copies in conversation history. Read package references with read_skill_file.\n\n<skill_instructions>\n${instructions}\n</skill_instructions>`,
  };
}
