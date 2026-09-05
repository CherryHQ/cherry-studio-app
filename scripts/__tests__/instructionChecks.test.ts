import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { buildAgentsSkillsGitignore, buildClaudeSkillsGitignore } from '../skills-common';

const temporaryRoots: string[] = [];
const tsxCli = require.resolve('tsx/cli');

function writeFiles(root: string, files: Record<string, string>) {
  for (const [relativePath, content] of Object.entries(files)) {
    const file = join(root, relativePath);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
}

function createFixture(files: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'instruction-checks-'));
  temporaryRoots.push(root);
  writeFiles(root, {
    '.agents/skills/public-skills.txt': 'example\n',
    '.agents/skills/.gitignore': buildAgentsSkillsGitignore(['example']),
    '.claude/skills/.gitignore': buildClaudeSkillsGitignore(['example']),
    '.agents/skills/example/SKILL.md': '---\nname: example\ndescription: A fixture\n---\n',
    ...files,
  });
  symlinkSync('../../.agents/skills/example', join(root, '.claude/skills/example'));
  mkdirSync(join(root, 'scripts'));
  for (const file of ['skills-common.ts', 'skills-check.ts', 'check-doc-links.ts']) {
    copyFileSync(join(__dirname, '..', file), join(root, 'scripts', file));
  }
  execFileSync('git', ['init', '--quiet', root]);
  execFileSync('git', ['add', '.'], { cwd: root });
  return root;
}

function runCheck(root: string, script: string) {
  const result = spawnSync(process.execPath, [tsxCli, join(root, 'scripts', script)], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
}

afterAll(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('public skill entry points', () => {
  test('accepts an installed public skill with its generated symlink', () => {
    const root = createFixture();
    expect(runCheck(root, 'skills-check.ts')).toMatchObject({ status: 0 });
  });

  test('rejects a skill directory whose entry point was removed', () => {
    const root = createFixture();
    rmSync(join(root, '.agents/skills/example/SKILL.md'));
    expect(runCheck(root, 'skills-check.ts')).toEqual({
      status: 1,
      output: expect.stringContaining('example/SKILL.md is missing or not a file'),
    });
  });

  test('rejects an empty entry point', () => {
    const root = createFixture({ '.agents/skills/example/SKILL.md': ' \n' });
    expect(runCheck(root, 'skills-check.ts')).toEqual({
      status: 1,
      output: expect.stringContaining('example/SKILL.md is empty'),
    });
  });
});

describe('public skill reference links', () => {
  test('reports a missing linked dependency inside a public skill reference', () => {
    const root = createFixture({
      '.agents/skills/example/references/workflow.md': '[Required skill](../../missing/SKILL.md)\n',
    });
    expect(runCheck(root, 'check-doc-links.ts')).toEqual({
      status: 1,
      output: expect.stringContaining('.agents/skills/example/references/workflow.md:1'),
    });
  });

  test('reports a required skill missing from a project guide', () => {
    const root = createFixture({
      'docs/guides/workflow.md': '[Required skill](../../.agents/skills/missing/SKILL.md)\n',
    });
    expect(runCheck(root, 'check-doc-links.ts')).toEqual({
      status: 1,
      output: expect.stringContaining('docs/guides/workflow.md:1'),
    });
  });

  test('accepts existing relative links without scanning unlisted personal skills', () => {
    const root = createFixture({
      '.agents/skills/example/references/workflow.md': '[Entry](../SKILL.md)\n',
      '.agents/skills/personal/SKILL.md': '[Private reference](missing.md)\n',
    });
    expect(runCheck(root, 'check-doc-links.ts')).toMatchObject({ status: 0 });
  });
});
