import { stringify } from 'yaml';

import { SkillsError } from '@/shared/contracts/skills';
import {
  CHERRY_SKILL_COMPATIBILITY,
  CreateSkillInputSchema,
  type CreateSkillInput,
} from '@/shared/data/types/skill';

import { validateSkillPackage } from './skillPackage';

/** The app owns frontmatter and creator identity; model text is the instruction body. */
export function authorSkillPackage(input: CreateSkillInput, author: string) {
  const parsed = CreateSkillInputSchema.safeParse(input);
  if (!parsed.success) throw new SkillsError('package-invalid', 'Invalid Skill name or content.');
  const { name, description, instructions, compatibility, license } = parsed.data;
  const allowedTools = [...new Set(parsed.data.allowedTools ?? [])];
  const tags = [...new Set(parsed.data.tags ?? [])];
  const frontmatter = stringify(
    {
      name,
      description,
      compatibility: [CHERRY_SKILL_COMPATIBILITY, compatibility].filter(Boolean).join(' '),
      ...(license ? { license } : {}),
      ...(allowedTools.length ? { 'allowed-tools': allowedTools.join(' ') } : {}),
      metadata: {
        ...(author.trim() ? { author: author.trim() } : {}),
        version: '1.0',
        ...(tags.length ? { tags: tags.join(', ') } : {}),
      },
    },
    { lineWidth: 0 },
  );
  const files = new Map([
    ['SKILL.md', new TextEncoder().encode(`---\n${frontmatter}---\n\n${instructions}\n`)],
  ]);
  const validation = validateSkillPackage(files, { expectedName: name });
  if (!validation.ok)
    throw new SkillsError(
      'package-invalid',
      `Invalid Skill package: ${validation.issues.map(({ code }) => code).join(', ')}.`,
    );
  return { files, package: validation.package };
}
