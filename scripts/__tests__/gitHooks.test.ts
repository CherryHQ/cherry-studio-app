import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

const posixTest = process.platform === 'win32' ? test.skip : test;
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

function writeExecutable(file: string, content: string) {
  writeFileSync(file, content);
  chmodSync(file, 0o755);
}

function writePrek(worktree: string, label: string) {
  const prek = join(worktree, 'node_modules/.bin/prek');
  mkdirSync(join(worktree, 'node_modules/.bin'), { recursive: true });
  writeExecutable(
    prek,
    `#!/bin/sh\nprintf '%s|%s\\n' ${shellQuote(label)} "$*" >> "$RESULT_FILE"\n`,
  );
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'cherry-git-hooks-'));
  const bin = join(root, 'bin');
  const main = join(root, 'main');
  const first = join(root, 'first-worktree');
  const second = join(root, 'second-worktree');
  const current = join(root, 'current-worktree');
  mkdirSync(bin);
  for (const worktree of [main, first, second, current]) mkdirSync(worktree);
  writeExecutable(
    join(bin, 'git'),
    `#!/bin/sh\nprintf '%s\\n' ${[main, first, second, current].map((worktree) => shellQuote(`worktree ${worktree}`)).join(' ')}\n`,
  );
  return { root, bin, first, second, current };
}

function runLauncher(cwd: string, bin: string, resultFile: string) {
  return spawnSync(
    'sh',
    [
      resolve('scripts/runPrek.sh'),
      'hook-impl',
      '--hook-type=post-checkout',
      '--',
      'old',
      'new',
      '1',
    ],
    {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: [bin, '/usr/bin', '/bin'].join(delimiter),
        RESULT_FILE: resultFile,
      },
    },
  );
}

posixTest('re-resolves another worktree prek after the previous worktree disappears', () => {
  const { root, bin, first, second, current } = createFixture();
  try {
    const resultFile = join(root, 'result');
    writePrek(first, 'first');
    writePrek(second, 'second');

    expect(runLauncher(current, bin, resultFile).status).toBe(0);
    rmSync(first, { recursive: true, force: true });
    expect(runLauncher(current, bin, resultFile).status).toBe(0);

    expect(readFileSync(resultFile, 'utf8').trim().split('\n')).toEqual([
      'first|hook-impl --hook-type=post-checkout -- old new 1',
      'second|hook-impl --hook-type=post-checkout -- old new 1',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

posixTest('prefers the current worktree and retains the PATH fallback', () => {
  const { root, bin, second, current } = createFixture();
  try {
    const resultFile = join(root, 'result');
    writePrek(second, 'second');
    writePrek(current, 'current');
    expect(runLauncher(current, bin, resultFile).status).toBe(0);
    expect(readFileSync(resultFile, 'utf8').trim()).toBe(
      'current|hook-impl --hook-type=post-checkout -- old new 1',
    );

    rmSync(join(current, 'node_modules'), { recursive: true, force: true });
    rmSync(join(second, 'node_modules'), { recursive: true, force: true });
    rmSync(resultFile);
    writeExecutable(
      join(bin, 'prek'),
      `#!/bin/sh\nprintf '%s|%s\\n' 'path' "$*" >> "$RESULT_FILE"\n`,
    );
    expect(runLauncher(current, bin, resultFile).status).toBe(0);
    expect(readFileSync(resultFile, 'utf8').trim()).toBe(
      'path|hook-impl --hook-type=post-checkout -- old new 1',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
