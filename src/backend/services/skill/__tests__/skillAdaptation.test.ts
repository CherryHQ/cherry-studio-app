import { adaptSkillPackage } from '../skillAdaptation';
import { validateSkillPackage } from '../skillPackage';

const header =
  '\uFEFF---\r\nname: mobile-notes\r\ndescription: Write a checked summary\r\nmetadata:\r\n  author: original\r\n---\r\n';
const body =
  '# Notes\r\nRead only the user supplied notes.\r\nKeep citations and verify the final summary.\r\nOptional: copy the summary to the desktop clipboard.\r\nReturn the complete summary in the conversation.\r\n';
const original = new Map([
  ['SKILL.md', new TextEncoder().encode(header + body)],
  ['references/template.md', new TextEncoder().encode('# Summary\nSources:')],
  ['assets/icon.bin', new Uint8Array([0, 255, 42])],
]);
const removal = {
  before: 'Optional: copy the summary to the desktop clipboard.\r\n',
  after: '',
  reason: 'Desktop clipboard is unavailable.',
};

test('changes only the exact body passage and preserves header, line endings and binary resources', () => {
  const result = adaptSkillPackage(original, 'mobile-notes', [removal]);
  expect(result.files.get('SKILL.md')).toEqual(
    new TextEncoder().encode(header + body.replace(removal.before, '')),
  );
  expect(result.files.get('assets/icon.bin')).toBe(original.get('assets/icon.bin'));
  expect(result.files.get('references/template.md')).toBe(original.get('references/template.md'));
  expect(original.get('SKILL.md')).toEqual(new TextEncoder().encode(header + body));
  const validated = validateSkillPackage(original);
  expect(validated.ok && result.package.contentHash !== validated.package.contentHash).toBe(true);
  expect(result.package.author).toBe('original');
});

test('matches the normalized instructions the model read without changing unrelated CRLF bytes', () => {
  const result = adaptSkillPackage(original, 'mobile-notes', [
    { ...removal, before: removal.before.replaceAll('\r\n', '\n') },
  ]);
  expect(result.files.get('SKILL.md')).toEqual(
    new TextEncoder().encode(header + body.replace(removal.before, '')),
  );
});

test.each([
  [{ ...removal, before: 'missing' }],
  [{ ...removal, before: 'summary' }],
  [{ ...removal, before: 'name: mobile-notes' }],
  [{ ...removal, before: body }],
  [removal, { ...removal, before: 'desktop clipboard.' }],
])('rejects absent, ambiguous, metadata, whole-body and overlapping changes', (changes) => {
  expect(() => adaptSkillPackage(original, 'mobile-notes', changes)).toThrow();
});

test('revalidates the adapted package instead of allowing new unsupported semantics', () => {
  expect(() =>
    adaptSkillPackage(original, 'mobile-notes', [{ ...removal, after: '!`run-shell`' }]),
  ).toThrow();
});
