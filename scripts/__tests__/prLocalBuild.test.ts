import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { parse } from 'yaml';

import {
  assertDiskSpace,
  assertNoSecretLeak,
  assertPrBuildEnv,
  cleanupStalePrWorkdirs,
  DEFAULT_ANDROID_GRADLE_OPTS,
  DEFAULT_PNPM_VIRTUAL_STORE_MAX_LENGTH,
  defaultRunLocalCommand,
  formatPrBatchOutputs,
  formatPrBatchSummary,
  parsePrBuildTargets,
  PR_BUILD_TARGETS,
  redactSecretsInStream,
  requireCliPath,
  requireSafeId,
  resolveAndroidBuildToolsDir,
  runPrBuildBatch,
  runPrBuildTarget,
  sanitizeSourceLabel,
  type RunLocalCommand,
} from '../prLocalBuild';

const createdRoots: string[] = [];

function makeTempDir(prefix = 'cherry-pr-build-test-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  createdRoots.push(dir);
  return dir;
}

function makePrBuildEnv(
  overrides: Partial<Record<string, string | undefined>> = {},
): NodeJS.ProcessEnv {
  const defaults: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    EXPO_TOKEN: 'synthetic-expo-token-0000',
  };
  const merged: NodeJS.ProcessEnv = { ...defaults };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  return merged;
}

function makeProjectFixture(root: string): {
  projectDir: string;
  easCliPath: string;
  localPluginPath: string;
} {
  const projectDir = join(root, 'repo');
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(
    join(projectDir, 'app.json'),
    JSON.stringify({
      expo: {
        version: '0.6.3',
        ios: { bundleIdentifier: 'com.cherryai.cherrystudio-app' },
        android: { package: 'com.cherryai.cherrystudio_app' },
      },
    }),
  );
  const easCliPath = join(projectDir, 'node_modules/eas-cli/bin/run');
  const localPluginPath = join(projectDir, 'node_modules/eas-cli-local-build-plugin/bin/run');
  mkdirSync(dirname(easCliPath), { recursive: true });
  mkdirSync(dirname(localPluginPath), { recursive: true });
  writeFileSync(easCliPath, '#!/usr/bin/env node\n');
  writeFileSync(localPluginPath, '#!/usr/bin/env node\n');
  return { projectDir, easCliPath, localPluginPath };
}

afterEach(() => {
  jest.restoreAllMocks();
  for (const root of createdRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('parsePrBuildTargets, sanitizeSourceLabel & cli validation', () => {
  it('parses, deduplicates, and sorts target lists in canonical lane order', () => {
    expect(parsePrBuildTargets('ios-dev, android-production, android-dev, ios-dev')).toEqual([
      'android-dev',
      'android-production',
      'ios-dev',
    ]);
    expect(parsePrBuildTargets('android-dev')).toEqual(['android-dev']);
    expect(() => parsePrBuildTargets('')).toThrow('Missing PR build targets');
    expect(() => parsePrBuildTargets('ios-production')).toThrow('Unknown PR build target');
  });

  it('sanitizes PR and branch labels into safe lowercase slugs', () => {
    expect(sanitizeSourceLabel('PR-1913')).toBe('pr-1913');
    expect(sanitizeSourceLabel('feat/my_branch..name')).toBe('feat-my_branch.name');
    expect(sanitizeSourceLabel('...leading-and-trailing---')).toBe('leading-and-trailing');
    expect(sanitizeSourceLabel('a'.repeat(80)).length).toBeLessThanOrEqual(48);
    expect(() => sanitizeSourceLabel('---')).toThrow('Invalid source label');
  });

  it('validates safe IDs and CLI paths', () => {
    expect(requireSafeId('12345', '--run-id')).toBe('12345');
    for (const bad of ['', '..', '../x', 'a/b', 'a..b', '.hidden', 'a\nb', 'a b']) {
      expect(() => requireSafeId(bad, '--run-id')).toThrow(/Invalid --run-id/);
    }
    expect(requireCliPath('relative/dir', '--output-dir')).toBe(resolve('relative/dir'));
    for (const bad of ['', '   ', 'a\0b', 'a\nb']) {
      expect(() => requireCliPath(bad, '--output-dir')).toThrow(/Invalid --output-dir/);
    }
  });
});

describe('assertPrBuildEnv & secret hygiene', () => {
  it('requires only EXPO_TOKEN and never echoes secret values', () => {
    const loaded = assertPrBuildEnv({ EXPO_TOKEN: '  expo-pr-token  ' });
    expect(loaded).toEqual({ EXPO_TOKEN: 'expo-pr-token' });
    expect(() => assertPrBuildEnv({})).toThrow('EXPO_TOKEN');
  });

  it('redacts tokens and rejects manifests containing secrets', () => {
    const secret = 'super-secret-expo-token-1234';
    const redacted = redactSecretsInStream(
      `Authorization: Bearer ${secret} failed with ${secret} and ghp_abcd1234`,
      [secret],
      { EXPO_TOKEN: secret },
    );
    expect(redacted).not.toContain(secret);
    expect(redacted).not.toContain('ghp_abcd1234');
    expect(() => assertNoSecretLeak(`{"token":"${secret}"}`, [secret])).toThrow(
      'containing secret material',
    );
  });

  it('resolves latest Android SDK build-tools dir when configured', () => {
    const root = makeTempDir();
    const sdk = join(root, 'android-sdk');
    mkdirSync(join(sdk, 'build-tools/36.0.0'), { recursive: true });
    mkdirSync(join(sdk, 'build-tools/37.0.0'), { recursive: true });
    expect(resolveAndroidBuildToolsDir({ ANDROID_HOME: sdk })).toBe(
      join(sdk, 'build-tools/37.0.0'),
    );
  });
});

describe('runPrBuildBatch', () => {
  const commitSha = '8bbbd64a99c965cae2077e8b5bb01058bd4b7af1';

  it('builds android-dev APK with development profile, dev package ID, no install permission, and no Sentry upload override', async () => {
    const root = makeTempDir();
    const { projectDir, easCliPath, localPluginPath } = makeProjectFixture(root);
    const releaseRoot = join(root, 'releases');
    const outputDir = join(root, 'out');
    const apkBytes = Buffer.from('synthetic-android-dev-apk');
    const expectedSha = createHash('sha256').update(apkBytes).digest('hex');
    const certificateSha256 = 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c';

    let capturedEasArgs: string[] = [];
    let capturedEnv: Record<string, string | undefined> = {};

    const run: RunLocalCommand = jest.fn(async (cmd, args, opts) => {
      if (args[0] === easCliPath) {
        capturedEasArgs = args;
        capturedEnv = opts?.env ?? {};
        writeFileSync(join(capturedEnv.EAS_LOCAL_BUILD_ARTIFACTS_DIR!, 'app-debug.apk'), apkBytes);
        return { stdout: 'built dev apk', stderr: '', exitCode: 0 };
      }
      if (cmd === 'unzip' && args[0] === '-tq') return { stdout: '', stderr: '', exitCode: 0 };
      if (cmd === 'unzip' && args[0] === '-Z1') {
        return { stdout: 'AndroidManifest.xml\nclasses.dex\n', stderr: '', exitCode: 0 };
      }
      if (cmd === 'apksigner' && args[0] === 'verify') {
        return {
          stdout: [
            'V2 Signer: certificate DN: CN=Android Debug, OU=Android, O=Unknown, L=Unknown, ST=Unknown, C=US',
            `V2 Signer: certificate SHA-256 digest: ${certificateSha256}`,
          ].join('\n'),
          stderr: '',
          exitCode: 0,
        };
      }
      if (cmd === 'aapt2' && args[0] === 'dump' && args[1] === 'badging') {
        return {
          stdout:
            "package: name='com.cherryai.cherrystudio_app.dev' versionCode='42' versionName='0.6.3'\n",
          stderr: '',
          exitCode: 0,
        };
      }
      throw new Error(`Unexpected command: ${cmd} ${args.join(' ')}`);
    });

    const result = await runPrBuildBatch({
      targets: ['android-dev'],
      sourceLabel: 'pr-1913',
      commitSha,
      runId: '7001',
      attempt: '1',
      projectDir,
      outputDir,
      releaseRoot,
      easCliPath,
      localPluginPath,
      env: makePrBuildEnv({
        EAS_LOCAL_BUILD_SKIP_CLEANUP: '1',
        CHERRY_LOCAL_RELEASE_SYMBOL_GATE: 'true',
      }),
      statfs: () => ({ bavail: 40 * 1024 ** 2, bsize: 1024 }),
      now: () => new Date('2026-11-27T04:00:00.000Z'),
      run,
    });

    expect(result.overallOk).toBe(true);
    expect(capturedEasArgs).toEqual([
      easCliPath,
      'build',
      '--local',
      '--platform',
      'android',
      '--profile',
      'development',
      '--non-interactive',
    ]);
    expect(capturedEasArgs).not.toContain('--output');
    expect(capturedEnv.GRADLE_OPTS).toBe(DEFAULT_ANDROID_GRADLE_OPTS);
    expect(capturedEnv.PNPM_CONFIG_VIRTUAL_STORE_DIR_MAX_LENGTH).toBe(
      DEFAULT_PNPM_VIRTUAL_STORE_MAX_LENGTH,
    );
    expect(capturedEnv.SENTRY_DISABLE_AUTO_UPLOAD).toBeUndefined();
    expect(capturedEnv.EAS_LOCAL_BUILD_SKIP_CLEANUP).toBeUndefined();
    expect(capturedEnv.CHERRY_LOCAL_RELEASE_SYMBOL_GATE).toBeUndefined();

    const outcome = result.targets['android-dev'];
    expect(outcome).toMatchObject({
      target: 'android-dev',
      status: 'built',
      artifactName: 'cherry-studio-pr-1913-8bbbd64-android-dev.apk',
      nativeBuildVersion: '42',
      sha256: expectedSha,
    });
    if (outcome.status !== 'built') throw new Error('expected built');
    expect(readFileSync(join(outcome.dir, 'SHA256SUMS'), 'utf8')).toBe(
      `${expectedSha}  cherry-studio-pr-1913-8bbbd64-android-dev.apk\n`,
    );
    expect(
      JSON.parse(readFileSync(join(outcome.dir, 'build-manifest.json'), 'utf8')),
    ).toMatchObject({
      sourceLabel: 'pr-1913',
      target: 'android-dev',
      profile: 'development',
      bundleOrPackageId: 'com.cherryai.cherrystudio_app.dev',
      signing: { certificateSha256 },
      sentryUploadDisabled: false,
    });
    expect(readdirSync(join(releaseRoot, '_pr-workdirs'))).toEqual([]);
  });

  it('builds ios-dev IPA with development profile, .dev bundle identifier, and cleanup/symbol-gate unset', async () => {
    const root = makeTempDir();
    const { projectDir, easCliPath, localPluginPath } = makeProjectFixture(root);
    const releaseRoot = join(root, 'releases');
    const outputDir = join(root, 'out');
    const ipaBytes = Buffer.from('synthetic-ios-dev-ipa');
    const expectedSha = createHash('sha256').update(ipaBytes).digest('hex');

    let capturedEasArgs: string[] = [];
    let capturedEnv: Record<string, string | undefined> = {};

    const run: RunLocalCommand = jest.fn(async (cmd, args, opts) => {
      if (args[0] === easCliPath) {
        capturedEasArgs = args;
        capturedEnv = opts?.env ?? {};
        writeFileSync(join(capturedEnv.EAS_LOCAL_BUILD_ARTIFACTS_DIR!, 'dev.ipa'), ipaBytes);
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      if (cmd === 'unzip' && args[0] === '-tq') return { stdout: '', stderr: '', exitCode: 0 };
      if (cmd === 'unzip' && args[0] === '-Z1') {
        return { stdout: 'Payload/CherryStudioDev.app/Info.plist\n', stderr: '', exitCode: 0 };
      }
      if (cmd === 'unzip' && args.includes('-j')) {
        const destDir = args[args.indexOf('-d') + 1]!;
        writeFileSync(join(destDir, 'Info.plist'), 'bplist00');
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      if (cmd === 'plutil') {
        return {
          stdout: JSON.stringify({
            CFBundleIdentifier: 'com.cherryai.cherrystudio-app.dev',
            CFBundleVersion: '108',
          }),
          stderr: '',
          exitCode: 0,
        };
      }
      throw new Error(`Unexpected command: ${cmd} ${args.join(' ')}`);
    });

    const result = await runPrBuildBatch({
      targets: ['ios-dev'],
      sourceLabel: 'pr-1913',
      commitSha,
      runId: '7002',
      attempt: '1',
      projectDir,
      outputDir,
      releaseRoot,
      easCliPath,
      localPluginPath,
      env: makePrBuildEnv({
        EAS_LOCAL_BUILD_SKIP_CLEANUP: '1',
        CHERRY_LOCAL_RELEASE_SYMBOL_GATE: 'true',
      }),
      statfs: () => ({ bavail: 60 * 1024 ** 2, bsize: 1024 }),
      run,
    });

    expect(result.overallOk).toBe(true);
    expect(capturedEasArgs).toEqual([
      easCliPath,
      'build',
      '--local',
      '--platform',
      'ios',
      '--profile',
      'development',
      '--non-interactive',
    ]);
    expect(capturedEnv.EAS_LOCAL_BUILD_SKIP_CLEANUP).toBeUndefined();
    expect(capturedEnv.CHERRY_LOCAL_RELEASE_SYMBOL_GATE).toBeUndefined();
    expect(result.targets['ios-dev']).toMatchObject({
      status: 'built',
      artifactName: 'cherry-studio-pr-1913-8bbbd64-ios-dev.ipa',
      nativeBuildVersion: '108',
      sha256: expectedSha,
    });
  });

  it('builds android-production APK with production profile, Sentry uploads disabled, and no local-release secrets', async () => {
    const root = makeTempDir();
    const { projectDir, easCliPath, localPluginPath } = makeProjectFixture(root);
    const releaseRoot = join(root, 'releases');
    const outputDir = join(root, 'out');
    const apkBytes = Buffer.from('synthetic-android-prod-apk');

    let capturedEasArgs: string[] = [];
    let capturedEnv: Record<string, string | undefined> = {};

    const run: RunLocalCommand = jest.fn(async (cmd, args, opts) => {
      if (args[0] === easCliPath) {
        capturedEasArgs = args;
        capturedEnv = opts?.env ?? {};
        writeFileSync(
          join(capturedEnv.EAS_LOCAL_BUILD_ARTIFACTS_DIR!, 'app-release.apk'),
          apkBytes,
        );
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      if (cmd === 'unzip' && args[0] === '-tq') return { stdout: '', stderr: '', exitCode: 0 };
      if (cmd === 'unzip' && args[0] === '-Z1') {
        return { stdout: 'AndroidManifest.xml\n', stderr: '', exitCode: 0 };
      }
      if (cmd === 'apksigner') {
        return {
          stdout: `Signer (minSdkVersion=33, maxSdkVersion=2147483647) certificate SHA-256 digest: ${'D'.repeat(64)}\n`,
          stderr: '',
          exitCode: 0,
        };
      }
      if (cmd === 'aapt2') {
        return {
          stdout: [
            "package: name='com.cherryai.cherrystudio_app' versionCode='299' versionName='0.6.3'",
            "uses-permission: name='android.permission.REQUEST_INSTALL_PACKAGES'",
          ].join('\n'),
          stderr: '',
          exitCode: 0,
        };
      }
      throw new Error(`Unexpected command: ${cmd} ${args.join(' ')}`);
    });

    const result = await runPrBuildBatch({
      targets: ['android-production'],
      sourceLabel: 'pr-1913',
      commitSha,
      runId: '7003',
      attempt: '1',
      projectDir,
      outputDir,
      releaseRoot,
      easCliPath,
      localPluginPath,
      env: makePrBuildEnv(),
      statfs: () => ({ bavail: 40 * 1024 ** 2, bsize: 1024 }),
      run,
    });

    expect(result.overallOk).toBe(true);
    expect(capturedEasArgs).toEqual([
      easCliPath,
      'build',
      '--local',
      '--platform',
      'android',
      '--profile',
      'production',
      '--non-interactive',
    ]);
    expect(capturedEnv.SENTRY_DISABLE_AUTO_UPLOAD).toBe('true');
    expect(capturedEnv.SENTRY_DISABLE_NATIVE_DEBUG_UPLOAD).toBe('true');
    expect(capturedEnv.SENTRY_ALLOW_FAILURE).toBe('true');
    expect(capturedEnv.SENTRY_AUTH_TOKEN).toBeUndefined();
    expect(result.targets['android-production']).toMatchObject({
      status: 'built',
      artifactName: 'cherry-studio-pr-1913-8bbbd64-android-production.apk',
      nativeBuildVersion: '299',
    });
  });

  it('enforces combined 80 GiB disk requirement, runs Android sequentially while isolating parallel iOS clone, and reports partial failures', async () => {
    const root = makeTempDir();
    const { projectDir, easCliPath, localPluginPath } = makeProjectFixture(root);
    const releaseRoot = join(root, 'releases');
    const outputDir = join(root, 'out');

    writeFileSync(join(projectDir, '.gitignore'), 'node_modules/\n');
    writeFileSync(join(projectDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
    execFileSync('git', ['init', '-q'], { cwd: projectDir });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: projectDir });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: projectDir });
    execFileSync('git', ['add', 'app.json', '.gitignore', 'pnpm-lock.yaml'], { cwd: projectDir });
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: projectDir });
    const headSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectDir,
      encoding: 'utf8',
    }).trim();

    await expect(
      runPrBuildBatch({
        targets: ['android-dev', 'ios-dev'],
        sourceLabel: 'pr-1913',
        commitSha: headSha,
        runId: '7004',
        attempt: '1',
        projectDir,
        outputDir,
        releaseRoot,
        easCliPath,
        localPluginPath,
        env: makePrBuildEnv(),
        statfs: () => ({ bavail: 70 * 1024 ** 2, bsize: 1024 }),
      }),
    ).rejects.toThrow('require at least 80 GiB');

    const easSequence: string[] = [];
    const easCwdsByProfile = new Map<string, string>();
    const pnpmInstalls: { cwd?: string; args: string[]; virtualMaxLen?: string }[] = [];
    let hadIsolatedGit = false;
    let hadNodeModulesSymlink = false;

    const run: RunLocalCommand = async (cmd, args, opts) => {
      if (cmd === 'pnpm' && args[0] === 'install') {
        pnpmInstalls.push({
          cwd: opts?.cwd,
          args,
          virtualMaxLen: opts?.env?.PNPM_CONFIG_VIRTUAL_STORE_DIR_MAX_LENGTH,
        });
        mkdirSync(join(opts!.cwd!, 'node_modules'), { recursive: true });
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      if (args[0] === easCliPath) {
        const platform = args[args.indexOf('--platform') + 1]!;
        const profile = args[args.indexOf('--profile') + 1]!;
        const key = `${platform}:${profile}`;
        easSequence.push(key);
        const cwd = opts?.cwd ?? '';
        easCwdsByProfile.set(key, cwd);

        if (key === 'android:production') {
          return { stdout: '', stderr: 'simulated gradle failure', exitCode: 1 };
        }
        if (platform === 'ios') {
          hadIsolatedGit = existsSync(join(cwd, '.git')) && cwd !== projectDir;
          hadNodeModulesSymlink =
            existsSync(join(cwd, 'node_modules')) &&
            lstatSync(join(cwd, 'node_modules')).isSymbolicLink();
          writeFileSync(join(opts!.env!.EAS_LOCAL_BUILD_ARTIFACTS_DIR!, 'dev.ipa'), 'ios-dev');
        } else {
          writeFileSync(join(opts!.env!.EAS_LOCAL_BUILD_ARTIFACTS_DIR!, 'dev.apk'), 'android-dev');
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      if (cmd === 'git') {
        return defaultRunLocalCommand(cmd, args, opts);
      }
      if (cmd === 'unzip' && args[0] === '-tq') return { stdout: '', stderr: '', exitCode: 0 };
      if (cmd === 'unzip' && args[0] === '-Z1') {
        return {
          stdout: args[1]!.endsWith('.ipa')
            ? 'Payload/CherryStudioDev.app/Info.plist\n'
            : 'AndroidManifest.xml\n',
          stderr: '',
          exitCode: 0,
        };
      }
      if (cmd === 'unzip' && args.includes('-j')) {
        const destDir = args[args.indexOf('-d') + 1]!;
        writeFileSync(join(destDir, 'Info.plist'), 'bplist00');
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      if (cmd === 'plutil') {
        return {
          stdout: JSON.stringify({
            CFBundleIdentifier: 'com.cherryai.cherrystudio-app.dev',
            CFBundleVersion: '110',
          }),
          stderr: '',
          exitCode: 0,
        };
      }
      if (cmd === 'apksigner') {
        return {
          stdout: `Signer #1 certificate SHA-256 digest: ${'a'.repeat(64)}\n`,
          stderr: '',
          exitCode: 0,
        };
      }
      if (cmd === 'aapt2') {
        return {
          stdout:
            "package: name='com.cherryai.cherrystudio_app.dev' versionCode='45' versionName='0.6.3'\n",
          stderr: '',
          exitCode: 0,
        };
      }
      throw new Error(`Unexpected command: ${cmd} ${args.join(' ')}`);
    };

    const result = await runPrBuildBatch({
      targets: ['ios-dev', 'android-production', 'android-dev'],
      sourceLabel: 'pr-1913',
      commitSha: headSha,
      runId: '7005',
      attempt: '1',
      projectDir,
      outputDir,
      releaseRoot,
      easCliPath,
      localPluginPath,
      env: makePrBuildEnv(),
      statfs: () => ({ bavail: 100 * 1024 ** 2, bsize: 1024 }),
      run,
    });

    expect(result.overallOk).toBe(false);
    expect(result.targets['android-dev'].status).toBe('built');
    expect(result.targets['ios-dev'].status).toBe('built');
    expect(result.targets['android-production']).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('simulated gradle failure'),
    });

    const devIdx = easSequence.indexOf('android:development');
    const prodIdx = easSequence.indexOf('android:production');
    expect(devIdx).toBeGreaterThan(-1);
    expect(prodIdx).toBeGreaterThan(devIdx);

    expect(easCwdsByProfile.get('android:development')).toBe(projectDir);
    expect(easCwdsByProfile.get('android:production')).toBe(projectDir);
    expect(easCwdsByProfile.get('ios:development')).toMatch(
      /\/_pr-workdirs\/cherry-studio-app-pr-7005-ios-dev-attempt1-[^/]+\/src$/,
    );
    expect(pnpmInstalls).toEqual([
      {
        cwd: easCwdsByProfile.get('ios:development'),
        args: ['install', '--frozen-lockfile', '--prefer-offline'],
        virtualMaxLen: '40',
      },
    ]);
    expect(hadIsolatedGit).toBe(true);
    expect(hadNodeModulesSymlink).toBe(false);
    expect(readdirSync(join(releaseRoot, '_pr-workdirs'))).toEqual([]);

    const outputs = formatPrBatchOutputs(result.overallOk, result.targets);
    expect(outputs.overall_ok).toBe('false');
    expect(outputs.android_dev_ready).toBe('true');
    expect(outputs.ios_dev_ready).toBe('true');
    expect(outputs.android_production_ready).toBe('false');
    expect(outputs.android_production_error).toContain('simulated gradle failure');

    const summary = formatPrBatchSummary(result.sourceLabel, result.commitSha, result.targets);
    expect(summary).toContain('`android-dev` | built');
    expect(summary).toContain('`ios-dev` | built');
    expect(summary).toContain('`android-production` | failed');
  });

  it('rejects git HEAD mismatch, dirty working tree, and cleans stale _pr-workdirs', async () => {
    const root = makeTempDir();
    const { projectDir, easCliPath, localPluginPath } = makeProjectFixture(root);
    const releaseRoot = join(root, 'releases');
    const outputDir = join(root, 'out');

    writeFileSync(join(projectDir, '.gitignore'), 'node_modules/\n');
    execFileSync('git', ['init', '-q'], { cwd: projectDir });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: projectDir });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: projectDir });
    execFileSync('git', ['add', 'app.json', '.gitignore'], { cwd: projectDir });
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: projectDir });
    const headSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectDir,
      encoding: 'utf8',
    }).trim();

    await expect(
      runPrBuildTarget({
        target: 'android-dev',
        sourceLabel: 'pr-1',
        commitSha: 'a'.repeat(40),
        runId: '1',
        attempt: '1',
        projectDir,
        outputDir,
        releaseRoot,
        easCliPath,
        localPluginPath,
        env: makePrBuildEnv(),
      }),
    ).rejects.toThrow('does not match --commit');

    writeFileSync(join(projectDir, 'dirty.txt'), 'dirty');
    await expect(
      runPrBuildTarget({
        target: 'android-dev',
        sourceLabel: 'pr-1',
        commitSha: headSha,
        runId: '2',
        attempt: '1',
        projectDir,
        outputDir,
        releaseRoot,
        easCliPath,
        localPluginPath,
        env: makePrBuildEnv(),
      }),
    ).rejects.toThrow('dirty git working tree');

    const workdirsRoot = join(releaseRoot, '_pr-workdirs');
    const deadDir = join(workdirsRoot, 'cherry-studio-app-pr-dead');
    mkdirSync(deadDir, { recursive: true });
    writeFileSync(join(deadDir, '.owner.pid'), '99999999\n');
    expect(cleanupStalePrWorkdirs(workdirsRoot)).toEqual(['cherry-studio-app-pr-dead']);
    expect(existsSync(deadDir)).toBe(false);
  });

  it('assertDiskSpace rejects insufficient available space', () => {
    expect(() =>
      assertDiskSpace('/tmp', 80, () => ({ bavail: 40 * 1024 ** 2, bsize: 1024 })),
    ).toThrow('Insufficient disk space');
  });

  it('PR_BUILD_TARGETS matches expected profile and permission contracts', () => {
    expect(PR_BUILD_TARGETS['android-dev']).toMatchObject({
      profile: 'development',
      expectInstallPermission: false,
      disableSentryUpload: false,
    });
    expect(PR_BUILD_TARGETS['ios-dev']).toMatchObject({
      profile: 'development',
      ext: 'ipa',
      disableSentryUpload: false,
    });
    expect(PR_BUILD_TARGETS['android-production']).toMatchObject({
      profile: 'production',
      expectInstallPermission: true,
      disableSentryUpload: true,
    });
  });
});

describe('pr-build workflow contract', () => {
  it('defines workflow_dispatch inputs, Mac Studio runner labels without local-release env, artifact uploads, and PR comment job', () => {
    const repo = resolve(__dirname, '../..');
    const workflow = parse(readFileSync(join(repo, '.github/workflows/pr-build.yml'), 'utf8')) as {
      on: {
        workflow_dispatch: {
          inputs: Record<string, { type: string; default?: unknown }>;
        };
      };
      jobs: Record<
        string,
        {
          needs?: string | string[];
          environment?: string;
          'runs-on'?: string | string[];
          permissions?: Record<string, string>;
          steps: Array<{ name: string; uses?: string; with?: Record<string, unknown> }>;
        }
      >;
    };

    expect(Object.keys(workflow.on.workflow_dispatch.inputs)).toEqual([
      'pr',
      'android_dev',
      'ios_dev',
      'android_production',
      'post_pr_comment',
    ]);
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);

    const resolveJob = workflow.jobs.resolve;
    expect(resolveJob).toBeDefined();
    expect(resolveJob['runs-on']).toBe('ubuntu-latest');

    const buildJob = workflow.jobs['build-native'];
    expect(buildJob).toBeDefined();
    expect(buildJob.needs).toBe('resolve');
    expect(buildJob['runs-on']).toEqual(['self-hosted', 'macOS', 'ARM64', 'release']);
    expect(buildJob.environment).toBeUndefined();
    expect(buildJob.permissions).toEqual({ contents: 'read' });
    expect(buildJob.steps.find((step) => step.with?.path === 'src')?.with?.ref).toBe(
      '${{ needs.resolve.outputs.source_sha }}',
    );

    const uploadSteps = buildJob.steps.filter((step) =>
      step.uses?.startsWith('actions/upload-artifact@'),
    );
    expect(uploadSteps).toHaveLength(3);
    expect(uploadSteps.map((step) => step.with?.name)).toEqual([
      'pr-build-${{ needs.resolve.outputs.source_label }}-${{ needs.resolve.outputs.short_sha }}-android-dev',
      'pr-build-${{ needs.resolve.outputs.source_label }}-${{ needs.resolve.outputs.short_sha }}-ios-dev',
      'pr-build-${{ needs.resolve.outputs.source_label }}-${{ needs.resolve.outputs.short_sha }}-android-production',
    ]);

    const notifyJob = workflow.jobs['notify-pr'];
    expect(notifyJob).toBeDefined();
    expect(notifyJob.needs).toEqual(['resolve', 'build-native']);
    expect(notifyJob['runs-on']).toBe('ubuntu-latest');
    expect(notifyJob.permissions).toEqual({ 'pull-requests': 'write' });
  });
});
