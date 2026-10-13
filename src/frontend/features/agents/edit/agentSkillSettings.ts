import type { AgentSkillUpdate } from '@/shared/data/api/schemas/skills';
import type { SkillListItem } from '@/shared/data/types/skill';

export { effectiveSkillStatus, mergeSkillReasons } from '@/frontend/utils/skillStatus';

/** Overlay unsaved toggles on the current Agent list, including newly installed Skills. */
export function createAgentSkillBindingDraft(
  skills: readonly SkillListItem[],
  updates: ReadonlyMap<string, AgentSkillUpdate>,
): Map<string, boolean> {
  const bindings = new Map(
    skills.flatMap((skill) =>
      skill.binding ? [[skill.id, skill.binding.isEnabled] as const] : [],
    ),
  );
  for (const update of updates.values()) {
    if (update.isEnabled === null) bindings.delete(update.skillId);
    else bindings.set(update.skillId, update.isEnabled);
  }
  return bindings;
}
