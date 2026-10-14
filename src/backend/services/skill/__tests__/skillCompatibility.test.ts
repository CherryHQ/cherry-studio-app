import { deriveSkillProfile, evaluateSkillLimitations } from '../skillCompatibility';

const manifest = (...paths: string[]) => paths.map((path) => ({ path, size: 1, digest: 'd' }));

describe('skill compatibility', () => {
  it('counts script files and leaves data beside them and template sources alone', () => {
    expect(
      evaluateSkillLimitations({
        manifest: manifest(
          'SKILL.md',
          'scripts/build.js',
          'scripts/data.json',
          'scripts/office/schemas/wml.xsd',
          'scripts/office/validate.py',
          'tools/setup.sh',
          'examples/Check.PY',
          'assets/template/src/App.tsx',
          'assets/template/index.js',
          'references/api.md',
        ),
        profile: { declaredTools: [] },
      }).scripts,
    ).toEqual([
      'scripts/build.js',
      'scripts/office/validate.py',
      'tools/setup.sh',
      'examples/Check.PY',
    ]);
  });

  it('reads declared tool names from either frontmatter form without their argument patterns', () => {
    const declared = (value: unknown) =>
      deriveSkillProfile({ frontmatter: { 'allowed-tools': value } }).declaredTools;
    expect(declared('Bash(git add:*), Read  Bash(npm run *) mcp__docs__search')).toEqual([
      'Bash',
      'Read',
      'mcp__docs__search',
    ]);
    expect(declared(['Write', 7, 'Grep(pattern)'])).toEqual(['Write', 'Grep']);
    expect(declared(undefined)).toEqual([]);
    expect(declared({ Bash: true })).toEqual([]);
  });

  it('reports only what the app lacks, never a tool it covers or does not know', () => {
    expect(
      evaluateSkillLimitations({
        manifest: manifest('scripts/run.py'),
        profile: { declaredTools: ['Read', 'Bash', 'WebSearch', 'mcp__docs__search', 'Grep'] },
      }),
    ).toEqual({ scripts: ['scripts/run.py'], unavailableTools: ['Bash', 'Grep'] });
    expect(
      evaluateSkillLimitations({ manifest: [], profile: { declaredTools: ['Edit'] } }),
    ).toEqual({
      scripts: [],
      unavailableTools: [],
    });
  });
});
