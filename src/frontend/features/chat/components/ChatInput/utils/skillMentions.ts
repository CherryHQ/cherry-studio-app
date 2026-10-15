import type { PluginTextReference } from '@/shared/data/types/plugin';
import type { SkillAction, SkillListItem, SkillTextReference } from '@/shared/data/types/skill';

import { createMentionLabel, isMentionEscaped, readMentionLabel } from './mentionLabels';

const SKILL_MENTION_PATTERN =
  /\[((?:\\.|[^\]\\\n])+)\]\(skill:\/\/(?:builtin\/(find-skills|create-skill)|installed\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))\)/gi;

export function createSkillMentionUrl(skillId: string): string {
  return `skill://installed/${skillId}`;
}

export function createSkillActionMention(action: SkillAction, label: string): string {
  const escapedLabel = createMentionLabel(label).replace(/[\\[\]]/g, '\\$&');
  return `[${escapedLabel}](skill://builtin/${action === 'create' ? 'create-skill' : 'find-skills'})`;
}

/** The editor owns references; submission separates their identity from plain prompt text. */
export function readSkillMentions(
  draft: string,
  pluginReferences: readonly PluginTextReference[] = [],
): {
  skills: Pick<SkillListItem, 'id' | 'name'>[];
  skillAction?: SkillAction;
  skillReferences: SkillTextReference[];
  pluginReferences: PluginTextReference[];
  text: string;
} {
  const skills = new Map<string, Pick<SkillListItem, 'id' | 'name'>>();
  const skillReferences: SkillTextReference[] = [];
  const replacements: { end: number; removedLength: number }[] = [];
  let skillAction: SkillAction | undefined;
  let text = '';
  let cursor = 0;
  for (const match of draft.matchAll(SKILL_MENTION_PATTERN)) {
    const [source, rawLabel, builtin, skillId] = match;
    if (isMentionEscaped(draft, match.index)) continue;
    const label = readMentionLabel(rawLabel);
    if (!label) continue;
    text += draft.slice(cursor, match.index);
    const offset = text.length;
    if (builtin) {
      skillAction = builtin.toLowerCase() === 'create-skill' ? 'create' : 'find-and-install';
      skillReferences.push({ type: 'skill-action', action: skillAction, label, offset });
    } else {
      const id = skillId.toLowerCase();
      if (!skills.has(id)) skills.set(id, { id, name: label });
      skillReferences.push({ type: 'skill', skillId: id, label, offset });
    }
    text += label;
    cursor = match.index + source.length;
    replacements.push({ end: cursor, removedLength: source.length - label.length });
  }
  return {
    skills: [...skills.values()],
    ...(skillAction ? { skillAction } : {}),
    skillReferences,
    pluginReferences: pluginReferences.map((reference) => ({
      ...reference,
      offset:
        reference.offset -
        replacements.reduce(
          (removed, replacement) =>
            removed + (replacement.end <= reference.offset ? replacement.removedLength : 0),
          0,
        ),
    })),
    text: text + draft.slice(cursor),
  };
}

/** Agent changes clear Skill references while retaining ordinary text and plugin references. */
export function removeSkillMentions(draft: string): string {
  return draft.replace(SKILL_MENTION_PATTERN, (source, _label, _builtin, _skillId, offset) =>
    isMentionEscaped(draft, offset) ? source : '',
  );
}
