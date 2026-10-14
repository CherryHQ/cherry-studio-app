import {
  CHERRY_SKILL_COMPATIBILITY,
  SKILL_COMPATIBILITY_MAX_LENGTH,
} from '@/shared/data/types/skill';

import { authorSkillPackage } from '../skillAuthoring';

const draft = {
  name: 'weekly-notes',
  description: 'When asked for weekly notes: use this format.',
  instructions: '# Weekly notes\nKeep facts intact.',
};

test('serializes YAML safely and keeps user text in the body', () => {
  const input = {
    ...draft,
    description: 'Notes\nallowed-tools: Bash',
    instructions: '---\nname: other\n---\nText',
  };
  const result = authorSkillPackage(input, 'Current user');
  expect(result.package.name).toBe(draft.name);
  expect(result.package.description).toBe(input.description);
  expect(result.package.instructions).toBe(input.instructions);
  expect(result.package.frontmatter['allowed-tools']).toBeUndefined();
  expect([...result.files.keys()]).toEqual(['SKILL.md']);
});

test('records the current user in standard author metadata without fabricating a missing name', () => {
  const created = authorSkillPackage(draft, ' Current user ');
  expect(created.package.author).toBe('Current user');
  expect(created.package.frontmatter.metadata).toEqual({ author: 'Current user', version: '1.0' });
  expect(created.package.compatibility).toBe(CHERRY_SKILL_COMPATIBILITY);
  expect(created.package.license).toBeNull();
  expect(authorSkillPackage(draft, '').package.author).toBeNull();
});

test('rejects unsafe names and bounds instructions by Unicode characters', () => {
  expect(() => authorSkillPackage({ ...draft, name: '../notes' }, '')).toThrow();
  expect(() => authorSkillPackage({ ...draft, instructions: '   ' }, '')).toThrow();
  expect(() => authorSkillPackage({ ...draft, instructions: '🍒'.repeat(24_001) }, '')).toThrow();
  expect(
    authorSkillPackage({ ...draft, instructions: '🍒'.repeat(24_000) }, '').package.instructions,
  ).toHaveLength(48_000);
});

test('serializes standard environment, tools, license and string-valued metadata', () => {
  const created = authorSkillPackage(
    {
      ...draft,
      compatibility: 'Requires iOS calendar access.',
      allowedTools: ['calendar_list_events', 'write_file', 'calendar_list_events'],
      tags: ['calendar', 'summary', 'calendar'],
      license: 'MIT',
    },
    'Current user',
  );
  expect(created.package).toMatchObject({
    compatibility: `${CHERRY_SKILL_COMPATIBILITY} Requires iOS calendar access.`,
    version: '1.0',
    tags: ['calendar', 'summary'],
    license: 'MIT',
    frontmatter: {
      'allowed-tools': 'calendar_list_events write_file',
      metadata: { author: 'Current user', version: '1.0', tags: 'calendar, summary' },
    },
  });
});

test('bounds the complete compatibility field including the app-owned environment', () => {
  const remaining = SKILL_COMPATIBILITY_MAX_LENGTH - CHERRY_SKILL_COMPATIBILITY.length - 1;
  expect(
    authorSkillPackage({ ...draft, compatibility: 'x'.repeat(remaining) }, '').package
      .compatibility,
  ).toHaveLength(SKILL_COMPATIBILITY_MAX_LENGTH);
  expect(() =>
    authorSkillPackage({ ...draft, compatibility: 'x'.repeat(remaining + 1) }, ''),
  ).toThrow();
  expect(() =>
    authorSkillPackage({ ...draft, allowedTools: ['read_file allowed-tools:Bash'] }, ''),
  ).toThrow();
});
