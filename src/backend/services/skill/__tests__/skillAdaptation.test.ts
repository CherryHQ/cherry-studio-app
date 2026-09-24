import type { SkillProfile } from '@/shared/data/types/skill';

import { adaptSkillPackage, applySkillAdaptation } from '../skillAdaptation';
import { validateSkillPackage } from '../skillPackage';

const encoder = new TextEncoder();
const originalText = '---\nname: notes\ndescription: Take notes\n---\nRead references/outline.md.';
const files = new Map([
  ['SKILL.md', encoder.encode(originalText)],
  ['references/outline.md', encoder.encode('Use headings.')],
  ['scripts/example.py', encoder.encode('print("example")')],
  ['LICENSE.md', encoder.encode('Keep this license.')],
]);
const validated = validateSkillPackage(files, { expectedName: 'notes' });
if (!validated.ok) throw new Error('Invalid test package');
const pkg = validated.package;
const adaptation: NonNullable<SkillProfile['adaptation']> = {
  version: 1,
  upstreamDigest: pkg.packageDigest,
  modelId: 'provider::model',
  adaptedAt: '2026-09-23T00:00:00.000Z',
  summary: 'Use package-local reading.',
  changes: [
    {
      path: 'SKILL.md',
      before: 'Read references/outline.md.',
      after: 'Read references/outline.md using read_skill_file.',
      reason: 'Use the app package reader.',
    },
  ],
};

describe('mobile Skill adaptations', () => {
  it('preserves original bytes and supporting files while producing a distinct accepted revision', () => {
    const result = applySkillAdaptation(files, pkg, adaptation);
    expect(new TextDecoder().decode(files.get('SKILL.md'))).toBe(originalText);
    expect(new TextDecoder().decode(result.files.get('SKILL.md'))).toContain('read_skill_file');
    expect(result.files.get('references/outline.md')).toEqual(files.get('references/outline.md'));
    expect(result.files.get('scripts/example.py')).toEqual(files.get('scripts/example.py'));
    expect(result.package.packageDigest).not.toBe(pkg.packageDigest);
  });

  it.each([
    { path: 'SKILL.md', before: 'name: notes', after: 'name: altered' },
    { path: 'scripts/example.py', before: 'print("example")', after: 'pass' },
    { path: 'LICENSE.md', before: 'Keep this license.', after: 'Remove attribution.' },
    { path: 'SKILL.md', before: 'A passage that does not exist', after: 'New instructions' },
    { path: 'SKILL.md', before: 'notes', after: 'ambiguous replacement' },
    { path: '../SKILL.md', before: 'notes', after: 'new' },
  ])('rejects identity, executable, license and untraceable edits: $path', (change) => {
    expect(() =>
      applySkillAdaptation(files, pkg, {
        ...adaptation,
        changes: [{ ...change, reason: 'Proposed edit' }],
      }),
    ).toThrow();
  });

  it('rejects a patch from another revision before applying any edits', () => {
    expect(() =>
      applySkillAdaptation(files, pkg, {
        ...adaptation,
        upstreamDigest: '0'.repeat(64),
      }),
    ).toThrow('another upstream revision');
  });

  it('cannot accept a proposal rejected by independent equivalence review', async () => {
    const assess = jest.fn();
    const result = await adaptSkillPackage(
      {
        planSearch: async () => [],
        rankResults: async () => [],
        adapt: async () => adaptation,
        reviewAdaptation: async () => false,
        assess,
      },
      pkg,
      files,
      new Map(),
    );
    expect(result).toBeNull();
    expect(assess).not.toHaveBeenCalled();
  });
});
