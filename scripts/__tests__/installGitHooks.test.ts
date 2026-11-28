import { execFileSync, execSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';

test('Git hooks still run after the installing worktree and its dependencies are removed', () => {
  const root = mkdtempSync(join(tmpdir(), 'cherry git hooks '));
  const repo = join(root, 'main');
  const linked = join(root, 'linked');
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))),
    NODE_ENV: process.env.NODE_ENV,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: join(root, 'gitconfig'),
    NODE_PATH: '',
    PREK_HOME: join(root, 'prek-cache'),
    PREK_BINARY: '',
  };
  function git(...args: string[]) {
    return execFileSync('git', args, { cwd: repo, env, encoding: 'utf8' });
  }

  try {
    mkdirSync(repo);
    git('init', '--quiet', '--template=');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.com');
    writeFileSync(
      join(repo, '.pre-commit-config.yaml'),
      `default_install_hook_types: [pre-commit, post-checkout, post-merge]
repos:
  - repo: local
    hooks:
      - id: record-hook
        name: Record hook invocation
        language: system
        entry: git config --local cherry.hook-ran true
        always_run: true
        pass_filenames: false
`,
    );
    git('add', '.pre-commit-config.yaml');
    git('commit', '-qm', 'fixture');
    git('worktree', 'add', '--quiet', '--detach', linked);

    // Give this worktree a real, disposable copy of pnpm's prek package and its native dependency.
    const fromProject = createRequire(resolve('package.json'));
    const scope = dirname(dirname(realpathSync(fromProject.resolve('@j178/prek/package.json'))));
    for (const name of readdirSync(scope)) {
      cpSync(realpathSync(join(scope, name)), join(linked, 'node_modules', '@j178', name), {
        recursive: true,
      });
    }
    const libcPackage = dirname(realpathSync(fromProject.resolve('detect-libc/package.json')));
    cpSync(libcPackage, join(linked, 'node_modules', 'detect-libc'), { recursive: true });
    mkdirSync(join(linked, 'scripts'));
    cpSync(resolve('scripts/installGitHooks.ts'), join(linked, 'scripts', 'installGitHooks.ts'));
    const { prepare } = fromProject('./package.json').scripts;
    execSync(prepare, { cwd: linked, env, stdio: 'pipe' });

    // Older branches can reuse the installed runner via the stock npm launcher's PREK_BINARY.
    const preCommit = join(repo, '.git', 'hooks', 'pre-commit');
    const installedHook = readFileSync(preCommit, 'utf8');
    const sharedBinary = installedHook.match(/^PREK="(.+)"$/m)?.[1];
    expect(sharedBinary).toContain('cherry-prek');
    execFileSync(
      process.execPath,
      [join(linked, 'node_modules/@j178/prek/bin/prek.js'), 'install'],
      {
        cwd: linked,
        env: { ...env, PREK_BINARY: sharedBinary },
      },
    );
    expect(readFileSync(preCommit, 'utf8')).toBe(installedHook);
    git('worktree', 'remove', '--force', linked);

    // A global prek or Node installation must not mask a broken runner.
    const bin = join(root, 'bin');
    mkdirSync(bin);
    for (const name of ['node', 'prek']) {
      writeFileSync(join(bin, name), '#!/bin/sh\nexit 99\n', { mode: 0o755 });
    }
    execFileSync('git', ['commit', '--allow-empty', '-qm', 'exercise shared hook'], {
      cwd: repo,
      env: { ...env, PATH: [bin, process.env.PATH].join(delimiter) },
    });
    expect(git('config', '--local', '--get', 'cherry.hook-ran').trim()).toBe('true');
    for (const name of ['pre-commit', 'post-checkout', 'post-merge']) {
      const shim = readFileSync(join(repo, '.git', 'hooks', name), 'utf8');
      expect(shim).toContain('cherry-prek');
      expect(shim).not.toContain('node_modules');
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
