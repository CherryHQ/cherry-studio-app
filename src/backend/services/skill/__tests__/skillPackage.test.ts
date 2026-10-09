import { createHash } from 'node:crypto';

import { computeContentHash, parseSkillEntry, validateSkillPackage } from '../skillPackage';

const encoder = new TextEncoder();

function files(entries: Record<string, string>) {
  return new Map(Object.entries(entries).map(([path, text]) => [path, encoder.encode(text)]));
}

const ENTRY = `---
name: daily-brief
description: "Summarize today's agenda. Use when the user asks for a daily brief."
license: MIT
metadata:
  author: cherry
  version: "1.2"
  tags: agenda, calendar
disable-model-invocation: true
---

# Daily brief

Read \`references/format.md\` first.
`;

describe('validateSkillPackage', () => {
  it('accepts a conforming package and binds digests to every file', () => {
    const result = validateSkillPackage(
      files({ 'SKILL.md': ENTRY, 'references/format.md': '# Format\n' }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.package).toMatchObject({
      name: 'daily-brief',
      description: "Summarize today's agenda. Use when the user asks for a daily brief.",
      license: 'MIT',
      author: 'cherry',
      version: '1.2',
      tags: ['agenda', 'calendar'],
      invocation: { modelInvocable: false, userInvocable: true },
    });
    expect(result.package.instructions.startsWith('# Daily brief')).toBe(true);
    expect(result.package.manifest.map((entry) => entry.path)).toEqual([
      'SKILL.md',
      'references/format.md',
    ]);
    expect(result.package.manifest[0]!.digest).toBe(
      createHash('sha256').update(ENTRY).digest('hex'),
    );

    const changedReference = validateSkillPackage(
      files({ 'SKILL.md': ENTRY, 'references/format.md': '# Format v2\n' }),
    );
    expect(changedReference.ok && changedReference.package.contentHash).not.toBe(
      result.package.contentHash,
    );
  });

  it('matches the desktop directory content hash byte for byte', () => {
    // Reference value from desktop SkillInstaller.computeDirectoryHash over the same tree on disk.
    const encoder = new TextEncoder();
    const tree = new Map(
      Object.entries({
        'Z.md': 'z',
        'SKILL.md': '---\nname: pkg\ndescription: d\n---\nUse references/a.md.\n',
        'references/deep/\u00fc.md': '\u00e9 \u4e2d\u6587\n',
        'assets/empty.txt': '',
        'references/a.md': '# A\n',
      }).map(([path, text]) => [path, encoder.encode(text)]),
    );
    expect(computeContentHash(tree)).toBe(
      'directory-sha256:47aa140032743ebb242a0432f60f4e94a506fd92abca25d954bfe0ac0b516c30',
    );
  });

  it('reports distinct validation issues', () => {
    expect(validateSkillPackage(files({ 'README.md': 'x' }))).toEqual({
      ok: false,
      issues: [{ code: 'entry-missing', subject: 'SKILL.md' }],
    });
    expect(validateSkillPackage(files({ 'SKILL.md': '# no frontmatter' }))).toEqual({
      ok: false,
      issues: [{ code: 'frontmatter-missing', subject: null }],
    });
    const invalid = validateSkillPackage(
      files({
        'SKILL.md': '---\nname: Bad_Name\ndescription:\nhooks:\n  PreToolUse: x\n---\nRun !`ls`',
        '../escape.md': 'x',
        'a/../b.md': 'x',
        'Refs/A.md': 'x',
        'refs/a.md': 'x',
        templates: 'file',
        'templates/note.md': 'x',
      }),
    );
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(invalid.issues).toEqual(
      expect.arrayContaining([
        { code: 'path-unsafe', subject: '../escape.md' },
        { code: 'path-unsafe', subject: 'a/../b.md' },
        { code: 'path-collision', subject: 'refs/a.md' },
        { code: 'path-collision', subject: 'templates/note.md' },
        { code: 'name-invalid', subject: 'Bad_Name' },
        { code: 'description-invalid', subject: null },
        { code: 'unsupported-semantics', subject: 'hooks' },
        { code: 'unsupported-semantics', subject: 'shell-interpolation' },
      ]),
    );
    const mismatch = validateSkillPackage(files({ 'SKILL.md': ENTRY }), {
      expectedName: 'other',
    });
    expect(mismatch).toEqual({
      ok: false,
      issues: [{ code: 'name-mismatch', subject: 'other' }],
    });
  });

  it('parses block scalars and quoted values', () => {
    const parsed = parseSkillEntry(
      "---\nname: x\ndescription: >\n  First line\n  second line\ncompatibility: 'needs ''python'''\n---\nbody",
    );
    expect(parsed).toEqual({
      frontmatter: {
        name: 'x',
        description: 'First line second line',
        compatibility: "needs 'python'",
      },
      body: 'body',
    });
    expect(parseSkillEntry('---\nname: x\n')).toEqual({ error: 'unterminated' });
  });
});
