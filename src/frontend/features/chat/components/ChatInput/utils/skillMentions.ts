import type { SkillListItem } from '@/shared/data/types/skill';

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
export function readSkillMentions(draft: string): {
  skills: Pick<SkillListItem, 'id' | 'name'>[];
  skillAction?: 'find-and-install';
  text: string;
} {
  const skills = new Map<string, Pick<SkillListItem, 'id' | 'name'>>();
  let skillAction: 'find-and-install' | undefined;
  const text = draft.replace(
    SKILL_MENTION_PATTERN,
    (source, rawLabel, builtin, skillId, offset) => {
      if (isEscaped(draft, offset)) return source;
      const label = rawLabel.replace(/^\uFFFC\u2009?/, '').replace(/\\([\\[\]])/g, '$1');
      if (!label) return source;
      if (builtin) skillAction = 'find-and-install';
      else {
        const id = skillId.toLowerCase();
        if (!skills.has(id)) skills.set(id, { id, name: label });
      }
      return label;
    },
  );
  return { skills: [...skills.values()], ...(skillAction ? { skillAction } : {}), text };
}

/** Agent changes clear Skill references while retaining ordinary text and plugin references. */
export function removeSkillMentions(draft: string): string {
  return draft.replace(SKILL_MENTION_PATTERN, (source, _label, _builtin, _skillId, offset) =>
    isEscaped(draft, offset) ? source : '',
  );
}
