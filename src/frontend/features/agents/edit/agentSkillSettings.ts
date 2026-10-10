import type { SkillListItem } from '@/shared/data/types/skill';

export { effectiveSkillStatus, mergeSkillReasons } from '@/frontend/utils/skillStatus';

/** Seeds the editor's binding draft from the evaluated Agent list. */
export function createAgentSkillBindingDraft(
  skills: readonly SkillListItem[],
): Map<string, boolean> {
  return new Map(
    skills.flatMap((skill) =>
      skill.binding ? [[skill.id, skill.binding.isEnabled] as const] : [],
    ),
  );
}
