import type { PluginTextReference } from '@/shared/data/types/plugin';
import type { SkillListItem, SkillTextReference } from '@/shared/data/types/skill';

const SKILL_MENTION_PATTERN =
  /\[((?:\\.|[^\]\\\n])+)\]\(skill:\/\/(?:builtin\/(find-skills)|installed\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))\)/gi;

export function createSkillMentionLabel(label: string): string {
  return `\uFFFC\u2009${label}`;
}

export function createSkillMentionUrl(skillId: string): string {
  return `skill://installed/${skillId}`;
}

export function createFindSkillsMention(label: string): string {
  const escapedLabel = createSkillMentionLabel(label).replace(/[\\[\]]/g, '\\$&');
  return `[${escapedLabel}](skill://builtin/find-skills)`;
}

function isEscaped(draft: string, offset: number): boolean {
  let slashes = 0;
  for (let index = offset - 1; index >= 0 && draft[index] === '\\'; index--) slashes++;
  return slashes % 2 === 1;
}

/** The editor owns references; submission separates their identity from plain prompt text. */
export function readSkillMentions(
  draft: string,
  pluginReferences: readonly PluginTextReference[] = [],
): {
  skills: Pick<SkillListItem, 'id' | 'name'>[];
  skillAction?: 'find-and-install';
  skillReferences: SkillTextReference[];
  pluginReferences: PluginTextReference[];
  text: string;
} {
  const skills = new Map<string, Pick<SkillListItem, 'id' | 'name'>>();
  const skillReferences: SkillTextReference[] = [];
  const replacements: { end: number; removedLength: number }[] = [];
  let skillAction: 'find-and-install' | undefined;
  let text = '';
  let cursor = 0;
  for (const match of draft.matchAll(SKILL_MENTION_PATTERN)) {
    const [source, rawLabel, builtin, skillId] = match;
    if (isEscaped(draft, match.index)) continue;
    const label = rawLabel.replace(/^\uFFFC\u2009?/, '').replace(/\\([\\[\]])/g, '$1');
    if (!label) continue;
    text += draft.slice(cursor, match.index);
    const offset = text.length;
    if (builtin) {
      skillAction = 'find-and-install';
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
    isEscaped(draft, offset) ? source : '',
  );
}
