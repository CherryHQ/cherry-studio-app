import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { parse } from 'yaml';

import {
  assertDiskSpace,
  assertReleaseEnv,
  cleanupStaleWorkdirs,
  DEFAULT_ANDROID_GRADLE_OPTS,
  DEFAULT_PNPM_VIRTUAL_STORE_MAX_LENGTH,
  defaultRunLocalCommand,
  findCompleteBuild,
  parseReleaseTag,
  pruneReleases,
  readSubmitReceipt,
  recordSubmitReceipt,
  recoverPendingIosBuild,
  REQUIRED_RELEASE_ENV_VARS,
  resolveReleaseRoot,
  runLocalReleaseBatch,
  runLocalReleaseBuild,
  verifyArchivedIpa,
  type RunLocalCommand,
} from '../releaseLocalBuild';

const createdRoots: string[] = [];

function makeTempDir(prefix = 'cherry-release-test-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  createdRoots.push(dir);
  return dir;
}

function makeReleaseEnv(
  overrides: Partial<Record<string, string | undefined>> = {},
): NodeJS.ProcessEnv {
  const defaults: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    EXPO_TOKEN: 'synthetic-expo-token-0000',
    EXPO_PUBLIC_SENTRY_DSN: 'https://syntheticKey@ingest.example/1',
    SENTRY_AUTH_TOKEN: 'synthetic-sentry-auth-token-9999',
    CHERRY_CLOUD_CLIENT_SECRET: 'synthetic-cloud-secret-1111',
    CHERRYAI_CLIENT_SECRET: 'synthetic-cherryai-secret-2222',
    CONFIG_SERVICE_ORIGIN: 'https://config.example.test',
    EXPO_PUBLIC_GITHUB_OAUTH_CLIENT_ID: 'synthetic-gh-client-id-3333',
    EXPO_PUBLIC_GITHUB_OAUTH_CLIENT_SECRET: 'synthetic-gh-client-secret-4444',
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
        version: '0.6.2',
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

describe('assertReleaseEnv & resolveReleaseRoot', () => {
  it('validates and trims all 8 required release env vars', () => {
    expect(REQUIRED_RELEASE_ENV_VARS).toHaveLength(8);
    const loaded = assertReleaseEnv(
      makeReleaseEnv({
        EXPO_TOKEN: '  expo-token-value  ',
        CONFIG_SERVICE_ORIGIN: ' https://config.example.test ',
      }),
    );
    expect(loaded.EXPO_TOKEN).toBe('expo-token-value');
    expect(loaded.CONFIG_SERVICE_ORIGIN).toBe('https://config.example.test');
  });

  it('rejects missing or whitespace-only release env vars without echoing present secrets', () => {
    const presentSecret = 'super-secret-do-not-echo-9876';
    let errorMessage = '';
    try {
      assertReleaseEnv(
        makeReleaseEnv({
          SENTRY_AUTH_TOKEN: presentSecret,
          CHERRYAI_CLIENT_SECRET: '   ',
          EXPO_TOKEN: undefined,
        }),
      );
    } catch (error) {
      errorMessage = (error as Error).message;
    }
    expect(errorMessage).toContain('EXPO_TOKEN');
    expect(errorMessage).toContain('CHERRYAI_CLIENT_SECRET');
    expect(errorMessage).not.toContain('SENTRY_AUTH_TOKEN');
    expect(errorMessage).not.toContain(presentSecret);
  });

  it('resolves release root with explicitRoot > RUNNER_RELEASE_ROOT > CHERRY_RELEASE_ROOT > ~/releases', () => {
    const explicit = join(tmpdir(), 'explicit-root');
    const orgRoot = join(tmpdir(), 'org-runner-root');
    const legacyRoot = join(tmpdir(), 'legacy-cherry-root');
    expect(
      resolveReleaseRoot(
        { RUNNER_RELEASE_ROOT: orgRoot, CHERRY_RELEASE_ROOT: legacyRoot },
        explicit,
      ),
    ).toBe(explicit);
    expect(
      resolveReleaseRoot({ RUNNER_RELEASE_ROOT: orgRoot, CHERRY_RELEASE_ROOT: legacyRoot }),
    ).toBe(orgRoot);
    expect(resolveReleaseRoot({ CHERRY_RELEASE_ROOT: legacyRoot })).toBe(legacyRoot);
    expect(resolveReleaseRoot({})).toBe(join(homedir(), 'releases'));
  });
});

describe('assertDiskSpace & parseReleaseTag', () => {
  it('enforces minimum free GiB threshold', () => {
    const ok = assertDiskSpace('/tmp', 30, () => ({ bavail: 40 * 1024 ** 2, bsize: 1024 }));
    expect(ok.availableBytes).toBeGreaterThanOrEqual(ok.requiredBytes);
    expect(() =>
      assertDiskSpace('/tmp', 50, () => ({ bavail: 20 * 1024 ** 2, bsize: 1024 })),
    ).toThrow('Insufficient disk space');
  });

  it('parses stable and prerelease tags and rejects malformed tags', () => {
    expect(parseReleaseTag('v0.6.2')).toEqual({
      tag: 'v0.6.2',
      releaseVersion: '0.6.2',
      baseVersion: '0.6.2',
      isPrerelease: false,
    });
    expect(parseReleaseTag('v0.6.2-rc.1')).toEqual({
      tag: 'v0.6.2-rc.1',
      releaseVersion: '0.6.2-rc.1',
      baseVersion: '0.6.2',
      isPrerelease: true,
    });
    expect(() => parseReleaseTag('0.6.2')).toThrow('Invalid release tag');
  });
});

describe('pruneReleases', () => {
  it('retains 5 newest stable versions within cherry-studio-app, honors .pin, and preserves sibling repos and non-version folders', () => {
    const root = makeTempDir();
    const releasesDir = join(root, 'cherry-studio-app');
    const versions = ['v0.6.0', 'v0.6.1', 'v0.6.2', 'v0.6.3', 'v0.6.4', 'v0.6.5', 'v0.6.6'];
    versions.forEach((tag, index) => {
      const complete = join(
        releasesDir,
        tag,
        'android-public',
        `build-10${index}-abc-run1`,
        '.complete',
      );
      mkdirSync(dirname(complete), { recursive: true });
      writeFileSync(complete, '{}');
      const time = new Date(1_700_000_000_000 + index * 1000);
      utimesSync(complete, time, time);
    });
    // Pin oldest stable release v0.6.0 so it survives rolling pruning.
    writeFileSync(join(releasesDir, 'v0.6.0', '.pin'), '');

    for (const [idx, pre] of ['v0.6.5-rc.1', 'v0.6.6-rc.1'].entries()) {
      const complete = join(
        releasesDir,
        pre,
        'ios-production',
        `build-5${idx}-abc-run2`,
        '.complete',
      );
      mkdirSync(dirname(complete), { recursive: true });
      writeFileSync(complete, '{}');
      const time = new Date(1_700_000_100_000 + idx * 1000);
      utimesSync(complete, time, time);
    }

    // Sibling org repo and non-version folder must never be touched by cherry-studio-app pruning.
    const siblingMarker = join(root, 'cherry-studio/v1.0.0/macos-arm64/.complete');
    const nonVersionMarker = join(releasesDir, 'notes/readme.txt');
    mkdirSync(dirname(siblingMarker), { recursive: true });
    mkdirSync(dirname(nonVersionMarker), { recursive: true });
    writeFileSync(siblingMarker, '{}');
    writeFileSync(nonVersionMarker, 'keep');

    const dry = pruneReleases({
      releaseRoot: root,
      keepStable: 5,
      keepPrerelease: 1,
      dryRun: true,
    });
    expect(dry.removed.sort()).toEqual(['v0.6.1', 'v0.6.5-rc.1']);
    expect(existsSync(join(releasesDir, 'v0.6.1'))).toBe(true);

    const applied = pruneReleases({ releaseRoot: root, keepStable: 5, keepPrerelease: 1 });
    expect(applied.removed.sort()).toEqual(['v0.6.1', 'v0.6.5-rc.1']);
    expect(existsSync(join(releasesDir, 'v0.6.0'))).toBe(true);
    expect(existsSync(join(releasesDir, 'v0.6.1'))).toBe(false);
    expect(existsSync(join(releasesDir, 'v0.6.2'))).toBe(true);
    expect(existsSync(join(releasesDir, 'v0.6.6'))).toBe(true);
    expect(existsSync(join(releasesDir, 'v0.6.6-rc.1'))).toBe(true);
    expect(existsSync(join(releasesDir, 'v0.6.5-rc.1'))).toBe(false);
    expect(existsSync(siblingMarker)).toBe(true);
    expect(existsSync(nonVersionMarker)).toBe(true);
  });
});

describe('runLocalReleaseBuild', () => {
  const commitSha = '1e1bc7acbe0e23dbde016b0e97976f24651c487f';

  it('builds and archives android-public APK under <root>/cherry-studio-app/<tag>, enforces install permission, and cleans _workdirs', async () => {
    const root = makeTempDir();
    const { projectDir, easCliPath, localPluginPath } = makeProjectFixture(root);
    const releaseRoot = join(root, 'releases');
    const baseEnv = makeReleaseEnv({ EAS_LOCAL_BUILD_ARTIFACT_PATH: '/should/be/cleared' });

    let capturedBuildEnv: NodeJS.ProcessEnv | undefined;
    let capturedEasArgs: string[] = [];
    let includeInstallPermission = true;
    const apkBytes = Buffer.from('synthetic-public-apk-payload');

    const run: RunLocalCommand = jest.fn(async (_cmd, args, opts) => {
      if (args[0] === easCliPath) {
        capturedEasArgs = args;
        capturedBuildEnv = opts?.env;
        const artifactsDir = opts!.env!.EAS_LOCAL_BUILD_ARTIFACTS_DIR!;
        writeFileSync(join(artifactsDir, 'build-123.apk'), apkBytes);
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      if (args[0] === '-tq') return { stdout: '', stderr: '', exitCode: 0 };
      if (args[0] === '-Z1')
        return { stdout: 'AndroidManifest.xml\nclasses.dex\n', exitCode: 0, stderr: '' };
      if (args[0] === 'verify') {
        return {
          stdout: 'Signer #1 certificate SHA-256 digest: abcdef0123456789\n',
          stderr: '',
          exitCode: 0,
        };
      }
      if (args[0] === 'dump' && args[1] === 'badging') {
        return {
          stdout: [
            "package: name='com.cherryai.cherrystudio_app' versionCode='128' versionName='0.6.2'",
            ...(includeInstallPermission
              ? ["uses-permission: name='android.permission.REQUEST_INSTALL_PACKAGES'"]
              : []),
          ].join('\n'),
          stderr: '',
          exitCode: 0,
        };
      }
      throw new Error(`Unexpected command args: ${args.join(' ')}`);
    });

    const result = await runLocalReleaseBuild({
      target: 'android-public',
      tag: 'v0.6.2',
      commitSha,
      runId: '9001',
      attempt: '1',
      projectDir,
      releaseRoot,
      easCliPath,
      localPluginPath,
      env: baseEnv,
      statfs: () => ({ bavail: 100 * 1024 ** 2, bsize: 1024 }),
      run,
      now: () => new Date('2026-11-23T06:00:00.000Z'),
    });

    expect(capturedEasArgs.slice(1)).toEqual([
      'build',
      '--local',
      '--platform',
      'android',
      '--profile',
      'production',
      '--non-interactive',
    ]);
    expect(capturedEasArgs).not.toContain('--output');
    expect(capturedBuildEnv?.EAS_LOCAL_BUILD_ARTIFACT_PATH).toBeUndefined();
    expect(capturedBuildEnv?.EAS_LOCAL_BUILD_SKIP_CLEANUP).toBeUndefined();
    expect(statSync(join(releaseRoot, '_workdirs')).mode & 0o777).toBe(0o700);
    expect(capturedBuildEnv?.SENTRY_ALLOW_FAILURE).toBe('false');
    expect(capturedBuildEnv?.PNPM_CONFIG_VIRTUAL_STORE_DIR_MAX_LENGTH).toBe(
      DEFAULT_PNPM_VIRTUAL_STORE_MAX_LENGTH,
    );
    expect(capturedBuildEnv?.GRADLE_OPTS).toBe(DEFAULT_ANDROID_GRADLE_OPTS);
    expect(capturedBuildEnv?.CHERRY_CLOUD_CLIENT_SECRET).toBe(baseEnv.CHERRY_CLOUD_CLIENT_SECRET);

    expect(result.nativeBuildVersion).toBe('128');
    expect(result.archiveDir).toBe(
      join(releaseRoot, 'cherry-studio-app/v0.6.2/android-public/build-128-1e1bc7a-run9001'),
    );
    expect(existsSync(join(result.archiveDir, '.complete'))).toBe(true);
    expect(readFileSync(join(result.archiveDir, 'SHA256SUMS'), 'utf8')).toBe(
      `${createHash('sha256').update(apkBytes).digest('hex')}  cherry-studio-0.6.2-android.apk\n`,
    );
    const latestLink = join(releaseRoot, 'cherry-studio-app/v0.6.2/android-public/latest');
    expect(lstatSync(latestLink).isSymbolicLink()).toBe(true);
    expect(readlinkSync(latestLink)).toBe('build-128-1e1bc7a-run9001');

    const manifestText = readFileSync(join(result.archiveDir, 'build-manifest.json'), 'utf8');
    const manifest = JSON.parse(manifestText);
    expect(manifest.commitSha).toBe(commitSha);
    expect(manifest.signing.certificateSha256).toBe('abcdef0123456789');
    for (const secretValue of REQUIRED_RELEASE_ENV_VARS.map((key) => baseEnv[key]!)) {
      expect(manifestText).not.toContain(secretValue);
    }

    // Shared _workdirs and temporary staging directories must be completely cleaned.
    expect(readdirSync(join(releaseRoot, '_workdirs'))).toEqual([]);
    expect(
      readdirSync(join(releaseRoot, 'cherry-studio-app/v0.6.2/android-public')).some((name) =>
        name.startsWith('.staging-'),
      ),
    ).toBe(false);

    // Public APK missing REQUEST_INSTALL_PACKAGES must fail and leave no staging/workdir leftovers.
    includeInstallPermission = false;
    await expect(
      runLocalReleaseBuild({
        target: 'android-public',
        tag: 'v0.6.2',
        commitSha,
        runId: '9002',
        attempt: '1',
        projectDir,
        releaseRoot,
        easCliPath,
        localPluginPath,
        env: makeReleaseEnv(),
        statfs: () => ({ bavail: 100 * 1024 ** 2, bsize: 1024 }),
        run,
      }),
    ).rejects.toThrow('REQUEST_INSTALL_PACKAGES');
    expect(readdirSync(join(releaseRoot, '_workdirs'))).toEqual([]);
    expect(
      readdirSync(join(releaseRoot, 'cherry-studio-app/v0.6.2/android-public')).some((name) =>
        name.startsWith('.staging-'),
      ),
    ).toBe(false);
  });

  it('validates Google Play AAB and domestic-stores APK isolation and rejects install permission', async () => {
    const root = makeTempDir();
    const { projectDir, easCliPath, localPluginPath } = makeProjectFixture(root);
    const releaseRoot = join(root, 'releases');

    let badPermission = false;
    let unsignedEntriesWarning = false;
    const run: RunLocalCommand = jest.fn(async (_cmd, args, opts) => {
      if (args[0] === easCliPath) {
        const isPlay = args.includes('production-google-play');
        writeFileSync(
          join(opts!.env!.EAS_LOCAL_BUILD_ARTIFACTS_DIR!, isPlay ? 'app.aab' : 'app.apk'),
          isPlay ? 'aab-bytes' : 'apk-bytes',
        );
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      if (args[0] === '-tq') return { stdout: '', stderr: '', exitCode: 0 };
      if (args[0] === '-Z1') {
        const isAab = args[1]!.endsWith('.aab');
        return {
          stdout: isAab ? 'base/manifest/AndroidManifest.xml\n' : 'AndroidManifest.xml\n',
          stderr: '',
          exitCode: 0,
        };
      }
      if (args.includes('-verify')) {
        return {
          stdout: unsignedEntriesWarning
            ? 'jar verified.\n\nWarning:\nThis jar contains unsigned entries which have not been integrity-checked.\n'
            : 'jar verified.\n',
          stderr: '',
          exitCode: 0,
        };
      }
      if (args[0] === 'dump' && args[1] === 'manifest') {
        return {
          stdout: `<manifest package="com.cherryai.cherrystudio_app" android:versionCode="129">${
            badPermission
              ? '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES"/>'
              : ''
          }</manifest>`,
          stderr: '',
          exitCode: 0,
        };
      }
      if (args[0] === 'verify') {
        return {
          stdout: 'Signer #1 certificate SHA-256 digest: 00112233\n',
          stderr: '',
          exitCode: 0,
        };
      }
      if (args[0] === 'dump' && args[1] === 'badging') {
        return {
          stdout: `package: name='com.cherryai.cherrystudio_app' versionCode='130'`,
          stderr: '',
          exitCode: 0,
        };
      }
      throw new Error(`Unexpected command: ${args.join(' ')}`);
    });

    const play = await runLocalReleaseBuild({
      target: 'android-google-play',
      tag: 'v0.6.2',
      commitSha,
      runId: '9003',
      attempt: '1',
      projectDir,
      releaseRoot,
      easCliPath,
      localPluginPath,
      env: makeReleaseEnv(),
      statfs: () => ({ bavail: 100 * 1024 ** 2, bsize: 1024 }),
      run,
    });
    expect(play.artifactName).toBe('cherry-studio-0.6.2-android.aab');
    expect(play.archiveDir).toContain('cherry-studio-app/v0.6.2/android-google-play');

    unsignedEntriesWarning = true;
    await expect(
      runLocalReleaseBuild({
        target: 'android-google-play',
        tag: 'v0.6.2',
        commitSha,
        runId: '9003b',
        attempt: '1',
        projectDir,
        releaseRoot,
        easCliPath,
        localPluginPath,
        env: makeReleaseEnv(),
        statfs: () => ({ bavail: 100 * 1024 ** 2, bsize: 1024 }),
        run,
      }),
    ).rejects.toThrow('unsigned entries');
    unsignedEntriesWarning = false;

    badPermission = true;
    await expect(
      runLocalReleaseBuild({
        target: 'android-google-play',
        tag: 'v0.6.2',
        commitSha,
        runId: '9004',
        attempt: '1',
        projectDir,
        releaseRoot,
        easCliPath,
        localPluginPath,
        env: makeReleaseEnv(),
        statfs: () => ({ bavail: 100 * 1024 ** 2, bsize: 1024 }),
        run,
      }),
    ).rejects.toThrow('REQUEST_INSTALL_PACKAGES');

    const domestic = await runLocalReleaseBuild({
      target: 'android-domestic-stores',
      tag: 'v0.6.2',
      commitSha,
      runId: '9005',
      attempt: '1',
      projectDir,
      releaseRoot,
      easCliPath,
      localPluginPath,
      env: makeReleaseEnv(),
      statfs: () => ({ bavail: 100 * 1024 ** 2, bsize: 1024 }),
      run,
    });
    expect(domestic.archiveDir).toContain('cherry-studio-app/v0.6.2/android-domestic-stores');
    const domesticManifest = JSON.parse(
      readFileSync(join(domestic.archiveDir, 'release-manifest.json'), 'utf8'),
    );
    expect(domesticManifest).toMatchObject({
      commit: commitSha,
      packageName: 'com.cherryai.cherrystudio_app',
      appVersion: '0.6.2',
      versionCode: '130',
      channel: 'production-domestic-stores',
      signingCertificateSha256: '00112233',
    });
  });

  it('builds ios-production, selects .ipa over buildArtifactPaths .tar.gz, archives ios-symbols, and supports findCompleteBuild + recordSubmitReceipt', async () => {
    const root = makeTempDir();
    const { projectDir, easCliPath, localPluginPath } = makeProjectFixture(root);
    const releaseRoot = join(root, 'releases');

    const localBuildId = '550e8400-e29b-41d4-a716-446655440000';
    let capturedEnv: NodeJS.ProcessEnv | undefined;
    const ipaBytes = Buffer.from('synthetic-ios-ipa-bytes');

    const run: RunLocalCommand = jest.fn(async (cmd, args, opts) => {
      if (args[0] === easCliPath) {
        capturedEnv = opts?.env;
        const artifactsDir = opts!.env!.EAS_LOCAL_BUILD_ARTIFACTS_DIR!;
        const workdir = opts!.env!.EAS_LOCAL_BUILD_WORKINGDIR!;
        // Simulate local-build-plugin writing both IPA and buildArtifactPaths tar.gz.
        writeFileSync(join(artifactsDir, 'build-100.ipa'), ipaBytes);
        writeFileSync(join(artifactsDir, 'build-101.tar.gz'), Buffer.from('symbols-tar'));
        const symbolsDir = join(workdir, 'build/ios/build/ios-symbols');
        mkdirSync(join(symbolsDir, 'package-abc'), { recursive: true });
        writeFileSync(join(symbolsDir, 'package.complete'), '{"directory":"package-abc"}');
        writeFileSync(join(symbolsDir, 'package-abc/dsyms.zip'), 'dsyms');
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      if (cmd === 'unzip' && args[0] === '-tq') return { stdout: '', stderr: '', exitCode: 0 };
      if (cmd === 'unzip' && args[0] === '-Z1') {
        return { stdout: 'Payload/CherryStudio.app/Info.plist\n', stderr: '', exitCode: 0 };
      }
      if (cmd === 'unzip' && args.includes('-j')) {
        const destDir = args[args.indexOf('-d') + 1]!;
        writeFileSync(join(destDir, 'Info.plist'), 'bplist00');
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      if (cmd === 'plutil') {
        return {
          stdout: JSON.stringify({
            CFBundleIdentifier: 'com.cherryai.cherrystudio-app',
            CFBundleVersion: '64',
          }),
          stderr: '',
          exitCode: 0,
        };
      }
      throw new Error(`Unexpected command ${cmd} ${args.join(' ')}`);
    });

    const verifySymbols = jest.fn(async ({ archivePath, buildId }) => ({
      status: 'download-verified' as const,
      buildId,
      manifestSha256: 'abc',
      symbolPackage: { size: 5, sha256: 'def' },
      slices: 3,
      thirdPartySymbols: [],
      verifiedAt: '2026-11-23T06:00:00.000Z',
      expiry: 'unknown' as const,
      archivePath,
    }));

    const result = await runLocalReleaseBuild({
      target: 'ios-production',
      tag: 'v0.6.2',
      commitSha,
      runId: '9006',
      attempt: '1',
      projectDir,
      releaseRoot,
      easCliPath,
      localPluginPath,
      localBuildId,
      env: makeReleaseEnv(),
      statfs: () => ({ bavail: 100 * 1024 ** 2, bsize: 1024 }),
      run,
      verifySymbols,
    });

    expect(capturedEnv?.CHERRY_LOCAL_RELEASE_SYMBOL_GATE).toBe('true');
    expect(capturedEnv?.CHERRY_LOCAL_BUILD_ID).toBe(localBuildId);
    expect(capturedEnv?.CHERRY_SOURCE_SHA).toBe(commitSha);
    expect(capturedEnv?.EAS_LOCAL_BUILD_SKIP_CLEANUP).toBe('1');
    expect(capturedEnv?.PNPM_CONFIG_VIRTUAL_STORE_DIR_MAX_LENGTH).toBe(
      DEFAULT_PNPM_VIRTUAL_STORE_MAX_LENGTH,
    );
    expect(readFileSync(result.artifactPath)).toEqual(ipaBytes);
    expect(existsSync(join(result.symbolsDir, 'package.complete'))).toBe(true);
    expect(existsSync(join(result.archiveDir, 'ios-symbol-verification.json'))).toBe(true);
    expect(verifySymbols).toHaveBeenCalledWith({
      archivePath: expect.stringMatching(/\.staging-run9006-attempt1-[^/]+\/ios-symbols$/),
      buildId: localBuildId,
    });
    expect(readdirSync(join(releaseRoot, '_workdirs'))).toEqual([]);

    const found = await findCompleteBuild({
      target: 'ios-production',
      tag: 'v0.6.2',
      commitSha,
      releaseRoot,
    });
    expect(found).toEqual({
      found: true,
      buildId: localBuildId,
      archiveDir: result.archiveDir,
      artifactName: result.artifactName,
      artifactPath: result.artifactPath,
      symbolsDir: result.symbolsDir,
      nativeBuildVersion: '64',
      sha256: result.sha256,
    });

    expect(readSubmitReceipt(result.archiveDir)).toBeNull();

    const wrongSha = await findCompleteBuild({
      target: 'ios-production',
      tag: 'v0.6.2',
      commitSha: 'f'.repeat(40),
      releaseRoot,
    });
    expect(wrongSha).toEqual({ found: false });

    const receipt = recordSubmitReceipt({
      buildDir: result.archiveDir,
      buildId: localBuildId,
      status: 'succeeded',
      now: () => new Date('2026-11-23T06:05:00.000Z'),
    });
    expect(receipt.status).toBe('succeeded');
    expect(existsSync(join(result.archiveDir, 'submit-receipt.json'))).toBe(true);
    expect(readSubmitReceipt(result.archiveDir)).toEqual(receipt);

    // Tampered IPA must invalidate findCompleteBuild reuse.
    writeFileSync(result.artifactPath, 'corrupt-ipa');
    await expect(
      findCompleteBuild({ target: 'ios-production', tag: 'v0.6.2', commitSha, releaseRoot }),
    ).resolves.toEqual({ found: false });
  });
});

describe('runLocalReleaseBatch', () => {
  const commitSha = '1e1bc7acbe0e23dbde016b0e97976f24651c487f';

  function createDeferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  }

  function makeBatchCommandRunner({
    onEasStart,
    failIosWithSecret,
  }: {
    onEasStart?: (platform: string, profile: string) => Promise<void>;
    failIosWithSecret?: string;
  } = {}): RunLocalCommand {
    return jest.fn(async (cmd, args, opts) => {
      if (args.includes('--local')) {
        const profile = args[args.indexOf('--profile') + 1]!;
        const platform = args[args.indexOf('--platform') + 1]!;
        if (onEasStart) {
          await onEasStart(platform, profile);
        }
        if (platform === 'ios' && failIosWithSecret) {
          return { stdout: '', stderr: `ios failed token=${failIosWithSecret}`, exitCode: 1 };
        }
        const artifactsDir = opts!.env!.EAS_LOCAL_BUILD_ARTIFACTS_DIR!;
        const workdir = opts!.env!.EAS_LOCAL_BUILD_WORKINGDIR!;
        if (platform === 'ios') {
          writeFileSync(join(artifactsDir, 'app.ipa'), Buffer.from('batch-ios-ipa'));
          const symbolsDir = join(workdir, 'build/ios/build/ios-symbols');
          mkdirSync(join(symbolsDir, 'package-abc'), { recursive: true });
          writeFileSync(join(symbolsDir, 'package.complete'), '{"directory":"package-abc"}');
          writeFileSync(join(symbolsDir, 'package-abc/dsyms.zip'), 'dsyms');
        } else if (profile === 'production-google-play') {
          writeFileSync(join(artifactsDir, 'app.aab'), Buffer.from('batch-play-aab'));
        } else {
          writeFileSync(join(artifactsDir, 'app.apk'), Buffer.from('batch-public-apk'));
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      if (cmd === 'unzip' && args[0] === '-tq') return { stdout: '', stderr: '', exitCode: 0 };
      if (cmd === 'unzip' && args[0] === '-Z1') {
        const file = args[1]!;
        if (file.endsWith('.ipa')) {
          return { stdout: 'Payload/CherryStudio.app/Info.plist\n', stderr: '', exitCode: 0 };
        }
        return {
          stdout: file.endsWith('.aab')
            ? 'base/manifest/AndroidManifest.xml\n'
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
            CFBundleIdentifier: 'com.cherryai.cherrystudio-app',
            CFBundleVersion: '70',
          }),
          stderr: '',
          exitCode: 0,
        };
      }
      if (args.includes('-verify')) return { stdout: 'jar verified.\n', stderr: '', exitCode: 0 };
      if (args[0] === 'dump' && args[1] === 'manifest') {
        return {
          stdout: '<manifest package="com.cherryai.cherrystudio_app" android:versionCode="202"/>',
          stderr: '',
          exitCode: 0,
        };
      }
      if (args[0] === 'verify') {
        return {
          stdout: 'Signer #1 certificate SHA-256 digest: 0123456789abcdef\n',
          stderr: '',
          exitCode: 0,
        };
      }
      if (args[0] === 'dump' && args[1] === 'badging') {
        return {
          stdout: [
            "package: name='com.cherryai.cherrystudio_app' versionCode='201' versionName='0.6.2'",
            "uses-permission: name='android.permission.REQUEST_INSTALL_PACKAGES'",
          ].join('\n'),
          stderr: '',
          exitCode: 0,
        };
      }
      throw new Error(`Unexpected command ${cmd} ${args.join(' ')}`);
    });
  }

  const okVerifySymbols = jest.fn(async ({ archivePath, buildId }) => ({
    status: 'download-verified' as const,
    buildId,
    manifestSha256: 'abc',
    symbolPackage: { size: 5, sha256: 'def' },
    slices: 3,
    thirdPartySymbols: [],
    verifiedAt: '2026-11-23T06:00:00.000Z',
    expiry: 'unknown' as const,
    archivePath,
  }));

  it('builds Android sequentially and iOS in parallel, checks combined disk space upfront, and prunes once', async () => {
    const root = makeTempDir();
    const { projectDir, easCliPath, localPluginPath } = makeProjectFixture(root);
    const releaseRoot = join(root, 'releases');

    // Pre-populate 6 old stable versions so single prune at end removes only oldest after all builds finish.
    for (let i = 0; i < 6; i++) {
      const marker = join(
        releaseRoot,
        'cherry-studio-app',
        `v0.5.${i}`,
        'android-public',
        `build-${i}-abc-run1`,
        '.complete',
      );
      mkdirSync(dirname(marker), { recursive: true });
      writeFileSync(marker, '{}');
      const time = new Date(1_700_000_000_000 + i * 1000);
      utimesSync(marker, time, time);
    }

    // Combined threshold for Android (30 GiB) + iOS (50 GiB) must reject 75 GiB before starting any build.
    await expect(
      runLocalReleaseBatch({
        tag: 'v0.6.2',
        commitSha,
        runId: '9100',
        attempt: '1',
        projectDir,
        releaseRoot,
        easCliPath,
        localPluginPath,
        env: makeReleaseEnv(),
        statfs: () => ({ bavail: 75 * 1024 ** 2, bsize: 1024 }),
        run: jest.fn(),
        verifySymbols: okVerifySymbols,
      }),
    ).rejects.toThrow('Insufficient disk space');

    const activeBuilds = new Set<string>();
    let sawConcurrentAndroidAndIos = false;
    const bothStarted = createDeferred();
    let androidPublicFinished = false;
    let playSawFinishedPublic = false;

    const run = makeBatchCommandRunner({
      onEasStart: async (platform, profile) => {
        const key = `${platform}:${profile}`;
        activeBuilds.add(key);
        if (profile === 'production-google-play') {
          playSawFinishedPublic = androidPublicFinished;
        }
        if (activeBuilds.has('android:production') && activeBuilds.has('ios:production')) {
          sawConcurrentAndroidAndIos = true;
          bothStarted.resolve();
        }
        if (profile === 'production' && !sawConcurrentAndroidAndIos) {
          await bothStarted.promise;
        }
        activeBuilds.delete(key);
        if (key === 'android:production') {
          androidPublicFinished = true;
        }
      },
    });

    const result = await runLocalReleaseBatch({
      tag: 'v0.6.2',
      commitSha,
      runId: '9101',
      attempt: '1',
      projectDir,
      releaseRoot,
      easCliPath,
      localPluginPath,
      env: makeReleaseEnv(),
      statfs: () => ({ bavail: 100 * 1024 ** 2, bsize: 1024 }),
      run,
      verifySymbols: okVerifySymbols,
    });

    expect(sawConcurrentAndroidAndIos).toBe(true);
    expect(playSawFinishedPublic).toBe(true);
    expect(result.overallOk).toBe(true);
    expect(result.targets['android-public'].status).toBe('built');
    expect(result.targets['android-google-play'].status).toBe('built');
    expect(result.targets['ios-production'].status).toBe('built');
    expect(result.targets['android-domestic-stores'].status).toBe('skipped');
    // activeVersion (v0.6.2) is pinned for the batch, so keeping 5 unpinned stable versions prunes only v0.5.0.
    expect(result.pruned).toEqual(['v0.5.0']);
    expect(existsSync(join(releaseRoot, 'cherry-studio-app', 'v0.5.0'))).toBe(false);
    expect(existsSync(join(releaseRoot, 'cherry-studio-app', 'v0.5.1'))).toBe(true);
  });

  it('isolates iOS failure from Android success and reuses archived Android builds on retry', async () => {
    const root = makeTempDir();
    const { projectDir, easCliPath, localPluginPath } = makeProjectFixture(root);
    const releaseRoot = join(root, 'releases');
    const secretToken = 'secret-sentry-value-do-not-leak';
    const env = makeReleaseEnv({ SENTRY_AUTH_TOKEN: secretToken });

    const firstRun = makeBatchCommandRunner({ failIosWithSecret: secretToken });
    const failedBatch = await runLocalReleaseBatch({
      tag: 'v0.6.2',
      commitSha,
      runId: '9201',
      attempt: '1',
      projectDir,
      releaseRoot,
      easCliPath,
      localPluginPath,
      env,
      statfs: () => ({ bavail: 100 * 1024 ** 2, bsize: 1024 }),
      run: firstRun,
      verifySymbols: okVerifySymbols,
    });

    expect(failedBatch.overallOk).toBe(false);
    expect(failedBatch.targets['android-public'].status).toBe('built');
    expect(failedBatch.targets['android-google-play'].status).toBe('built');
    expect(failedBatch.targets['ios-production']).toMatchObject({
      target: 'ios-production',
      status: 'failed',
    });
    if (failedBatch.targets['ios-production'].status === 'failed') {
      expect(failedBatch.targets['ios-production'].error).toContain('[redacted]');
      expect(failedBatch.targets['ios-production'].error).not.toContain(secretToken);
    }

    // Retry should require only 50 GiB (iOS only), reuse both Android artifacts, and build only iOS.
    const seenPlatforms: string[] = [];
    const retryRun: RunLocalCommand = jest.fn(async (cmd, args, opts) => {
      if (args.includes('--local')) {
        seenPlatforms.push(args[args.indexOf('--platform') + 1]!);
      }
      return makeBatchCommandRunner()(cmd, args, opts);
    });

    const retriedBatch = await runLocalReleaseBatch({
      tag: 'v0.6.2',
      commitSha,
      runId: '9202',
      attempt: '1',
      projectDir,
      releaseRoot,
      easCliPath,
      localPluginPath,
      env,
      // 60 GiB is enough for iOS alone (50 GiB) because Android builds are reused.
      statfs: () => ({ bavail: 60 * 1024 ** 2, bsize: 1024 }),
      run: retryRun,
      verifySymbols: okVerifySymbols,
    });

    expect(seenPlatforms).toEqual(['ios']);
    expect(retriedBatch.overallOk).toBe(true);
    expect(retriedBatch.targets['android-public'].status).toBe('reused');
    expect(retriedBatch.targets['android-google-play'].status).toBe('reused');
    expect(retriedBatch.targets['ios-production'].status).toBe('built');
  });

  it('skips Google Play AAB on prerelease tags', async () => {
    const root = makeTempDir();
    const { projectDir, easCliPath, localPluginPath } = makeProjectFixture(root);
    const releaseRoot = join(root, 'releases');

    const result = await runLocalReleaseBatch({
      tag: 'v0.6.2-rc.1',
      commitSha,
      runId: '9301',
      attempt: '1',
      projectDir,
      releaseRoot,
      easCliPath,
      localPluginPath,
      env: makeReleaseEnv(),
      statfs: () => ({ bavail: 100 * 1024 ** 2, bsize: 1024 }),
      run: makeBatchCommandRunner(),
      verifySymbols: okVerifySymbols,
    });

    expect(result.overallOk).toBe(true);
    expect(result.targets['android-public'].status).toBe('built');
    expect(result.targets['android-google-play'].status).toBe('skipped');
    expect(result.targets['ios-production'].status).toBe('built');
  });
});

describe('release hardening & integrity guards', () => {
  const commitSha = '1e1bc7acbe0e23dbde016b0e97976f24651c487f';

  it('redacts secrets across chunk boundaries and final partial lines during live streaming', async () => {
    const secret = 'super-live-secret-token-4242';
    const stdoutWrites: string[] = [];
    const stderrWrites: string[] = [];
    const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutWrites.push(String(chunk));
      return true;
    });
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrWrites.push(String(chunk));
      return true;
    });

    try {
      const script = [
        `const s = ${JSON.stringify(secret)};`,
        `process.stdout.write('url=https://example.test/build chunk=' + s.slice(0, 10));`,
        `setTimeout(() => {`,
        `  process.stdout.write(s.slice(10) + '\\n');`,
        `  process.stderr.write('tail-no-newline=' + s);`,
        `}, 25);`,
      ].join('\n');

      const res = await defaultRunLocalCommand(process.execPath, ['-e', script], {
        streamOutput: true,
        logPrefix: 'ios-production',
        secrets: [secret],
      });

      expect(res.exitCode).toBe(0);
      expect(stdoutWrites.join('')).toContain('https://example.test/build');
      expect(stdoutWrites.join('')).toContain(
        '[ios-production] url=https://example.test/build chunk=[redacted]',
      );
      expect(stdoutWrites.join('')).not.toContain(secret);
      expect(stderrWrites.join('')).toContain('[ios-production] tail-no-newline=[redacted]');
      expect(stderrWrites.join('')).not.toContain(secret);
      expect(res.stdout).not.toContain(secret);
      expect(res.stderr).not.toContain(secret);
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it('cleans up dead-PID and aged untracked _workdirs while preserving live and sibling dirs', () => {
    const root = makeTempDir();
    const workdirsRoot = join(root, '_workdirs');
    mkdirSync(workdirsRoot, { recursive: true });

    const deadDir = join(workdirsRoot, 'cherry-studio-app-1-android-public-dead');
    const liveDir = join(workdirsRoot, 'cherry-studio-app-2-ios-production-live');
    const oldLegacyDir = join(workdirsRoot, 'cherry-studio-app-3-legacy');
    const siblingDir = join(workdirsRoot, 'cherry-studio-9-macos-live');
    for (const dir of [deadDir, liveDir, oldLegacyDir, siblingDir]) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(join(deadDir, '.owner.pid'), '999001\n');
    writeFileSync(join(liveDir, '.owner.pid'), `${process.pid}\n`);
    writeFileSync(join(siblingDir, '.owner.pid'), '999001\n');
    const staleDate = new Date(Date.now() - 10 * 60_000);
    utimesSync(oldLegacyDir, staleDate, staleDate);

    const originalKill = process.kill;
    const killSpy = jest.spyOn(process, 'kill').mockImplementation(((
      pid: number,
      signal?: number,
    ) => {
      if (pid === 999001 && signal === 0) {
        const err = new Error('ESRCH') as NodeJS.ErrnoException;
        err.code = 'ESRCH';
        throw err;
      }
      return originalKill.call(process, pid, signal as NodeJS.Signals | number | undefined);
    }) as typeof process.kill);

    try {
      const removed = cleanupStaleWorkdirs(workdirsRoot);
      expect(removed.sort()).toEqual([
        'cherry-studio-app-1-android-public-dead',
        'cherry-studio-app-3-legacy',
      ]);
      expect(existsSync(deadDir)).toBe(false);
      expect(existsSync(oldLegacyDir)).toBe(false);
      expect(existsSync(liveDir)).toBe(true);
      expect(existsSync(siblingDir)).toBe(true);
    } finally {
      killSpy.mockRestore();
    }
  });

  it('retains signed IPA and original symbols in pending-symbols-* when upload.pending is present', async () => {
    const root = makeTempDir();
    const { projectDir, easCliPath, localPluginPath } = makeProjectFixture(root);
    const releaseRoot = join(root, 'releases');
    const localBuildId = '660e8400-e29b-41d4-a716-446655440000';
    const ipaBytes = Buffer.from('pending-ios-ipa-bytes');

    const run: RunLocalCommand = jest.fn(async (cmd, args, opts) => {
      if (args[0] === easCliPath) {
        writeFileSync(join(opts!.env!.EAS_LOCAL_BUILD_ARTIFACTS_DIR!, 'build.ipa'), ipaBytes);
        const symbolsDir = join(
          opts!.env!.EAS_LOCAL_BUILD_WORKINGDIR!,
          'build/ios/build/ios-symbols',
        );
        mkdirSync(join(symbolsDir, 'attempt-abc'), { recursive: true });
        writeFileSync(join(symbolsDir, 'upload.pending'), '{"directory":"attempt-abc"}');
        writeFileSync(join(symbolsDir, 'attempt-abc/dsyms.zip'), 'orig-dsyms');
        writeFileSync(join(symbolsDir, 'attempt-abc/archive-info.plist'), '<plist/>');
        const symbolManifestText = JSON.stringify({ schemaVersion: 1, buildId: localBuildId });
        writeFileSync(join(symbolsDir, 'attempt-abc/manifest.json'), symbolManifestText);
        writeFileSync(
          join(symbolsDir, 'attempt-abc/verification.json'),
          JSON.stringify({
            schemaVersion: 1,
            buildId: localBuildId,
            manifestSha256: createHash('sha256').update(symbolManifestText).digest('hex'),
            preflight: { status: 'passed' },
            upload: { status: 'failed' },
            remoteVerification: { status: 'pending' },
            records: [],
            failure: { code: 'SENTRY_TIMEOUT' },
          }),
        );
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      if (cmd === 'unzip' && args[0] === '-tq') return { stdout: '', stderr: '', exitCode: 0 };
      if (cmd === 'unzip' && args[0] === '-Z1') {
        return { stdout: 'Payload/CherryStudio.app/Info.plist\n', stderr: '', exitCode: 0 };
      }
      if (cmd === 'unzip' && args.includes('-j')) {
        const destDir = args[args.indexOf('-d') + 1]!;
        writeFileSync(join(destDir, 'Info.plist'), 'bplist00');
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      if (cmd === 'plutil') {
        return {
          stdout: JSON.stringify({
            CFBundleIdentifier: 'com.cherryai.cherrystudio-app',
            CFBundleVersion: '65',
          }),
          stderr: '',
          exitCode: 0,
        };
      }
      throw new Error(`Unexpected command ${cmd}`);
    });

    await expect(
      runLocalReleaseBuild({
        target: 'ios-production',
        tag: 'v0.6.2',
        commitSha,
        runId: '9401',
        attempt: '1',
        projectDir,
        releaseRoot,
        easCliPath,
        localPluginPath,
        localBuildId,
        env: makeReleaseEnv(),
        statfs: () => ({ bavail: 100 * 1024 ** 2, bsize: 1024 }),
        run,
        verifySymbols: jest.fn(),
      }),
    ).rejects.toThrow('pending-symbols-65-');

    const channelDir = join(releaseRoot, 'cherry-studio-app/v0.6.2/ios-production');
    const entries = readdirSync(channelDir);
    const pendingName = entries.find((name) => name.startsWith('pending-symbols-65-'));
    expect(pendingName).toBeDefined();
    const pendingDir = join(channelDir, pendingName!);
    expect(existsSync(join(pendingDir, 'cherry-studio-0.6.2-ios.ipa'))).toBe(true);
    expect(existsSync(join(pendingDir, 'ios-symbols/upload.pending'))).toBe(true);
    expect(existsSync(join(pendingDir, '.complete'))).toBe(false);
    expect(
      JSON.parse(readFileSync(join(pendingDir, 'build-manifest.json'), 'utf8')).sentry,
    ).toMatchObject({
      pendingUpload: true,
      verified: false,
      symbolPackageComplete: false,
    });
    expect(readdirSync(join(releaseRoot, '_workdirs'))).toEqual([]);
    await expect(
      findCompleteBuild({ target: 'ios-production', tag: 'v0.6.2', commitSha, releaseRoot }),
    ).resolves.toEqual({ found: false });

    const repairedRecords = [
      { id: '901', uuid: 'uuid-1', arch: 'arm64', symbolType: 'macho', features: ['debug'] },
    ];
    const verifySymbolsRecovery = jest.fn(async ({ archivePath, buildId }) => ({
      status: 'download-verified' as const,
      buildId,
      manifestSha256: 'abc',
      symbolPackage: { size: 5, sha256: 'def' },
      slices: 3,
      thirdPartySymbols: [],
      repairedRecords,
      verifiedAt: '2026-11-23T06:10:00.000Z',
      expiry: 'unknown' as const,
      archivePath,
    }));

    const recovered = await recoverPendingIosBuild({
      pendingDir,
      verifySymbols: verifySymbolsRecovery,
      now: () => new Date('2026-11-23T06:10:00.000Z'),
    });
    expect(verifySymbolsRecovery).toHaveBeenCalledWith({
      archivePath: join(pendingDir, 'ios-symbols'),
      buildId: localBuildId,
      retryUpload: true,
    });
    expect(existsSync(pendingDir)).toBe(false);
    expect(recovered.archiveDir).toBe(
      join(channelDir, `build-65-${commitSha.slice(0, 7)}-run9401`),
    );
    expect(existsSync(join(recovered.archiveDir, '.complete'))).toBe(true);
    expect(existsSync(join(recovered.archiveDir, 'ios-symbol-verification.json'))).toBe(true);
    expect(existsSync(join(recovered.symbolsDir, 'upload.pending'))).toBe(false);
    expect(existsSync(join(recovered.symbolsDir, 'package.complete'))).toBe(true);
    const completePtr = JSON.parse(
      readFileSync(join(recovered.symbolsDir, 'package.complete'), 'utf8'),
    ) as { directory: string };
    expect(completePtr.directory).toMatch(/^package-[A-Za-z0-9]+$/);
    const promotedReceipt = JSON.parse(
      readFileSync(join(recovered.symbolsDir, completePtr.directory, 'verification.json'), 'utf8'),
    );
    expect(promotedReceipt).toMatchObject({
      upload: { status: 'passed' },
      remoteVerification: { status: 'passed' },
      failure: null,
      records: repairedRecords,
    });
    expect(
      JSON.parse(readFileSync(join(recovered.archiveDir, 'build-manifest.json'), 'utf8')).sentry,
    ).toMatchObject({
      pendingUpload: false,
      verified: true,
      symbolPackageComplete: true,
    });
    await expect(
      findCompleteBuild({ target: 'ios-production', tag: 'v0.6.2', commitSha, releaseRoot }),
    ).resolves.toMatchObject({
      found: true,
      buildId: localBuildId,
      archiveDir: recovered.archiveDir,
      artifactPath: recovered.artifactPath,
    });
  });

  it('enforces git HEAD / clean tree and installs local deps inside isolated clone without node_modules symlinks', async () => {
    const root = makeTempDir();
    const { projectDir, easCliPath, localPluginPath } = makeProjectFixture(root);
    const releaseRoot = join(root, 'releases');

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

    // Mismatched --commit must fail before launching EAS.
    await expect(
      runLocalReleaseBuild({
        target: 'android-public',
        tag: 'v0.6.2',
        commitSha: 'a'.repeat(40),
        runId: '9501',
        attempt: '1',
        projectDir,
        releaseRoot,
        easCliPath,
        localPluginPath,
        env: makeReleaseEnv(),
        statfs: () => ({ bavail: 100 * 1024 ** 2, bsize: 1024 }),
      }),
    ).rejects.toThrow('does not match --commit');

    // Dirty working tree must fail.
    writeFileSync(join(projectDir, 'untracked-dirty.txt'), 'dirty');
    await expect(
      runLocalReleaseBuild({
        target: 'android-public',
        tag: 'v0.6.2',
        commitSha: headSha,
        runId: '9502',
        attempt: '1',
        projectDir,
        releaseRoot,
        easCliPath,
        localPluginPath,
        env: makeReleaseEnv(),
        statfs: () => ({ bavail: 100 * 1024 ** 2, bsize: 1024 }),
      }),
    ).rejects.toThrow('dirty git working tree');
    rmSync(join(projectDir, 'untracked-dirty.txt'));

    const pnpmInstalls: { cwd?: string; args: string[] }[] = [];
    const easCwdsByPlatform = new Map<string, string>();
    let hadIsolatedGit = false;
    let hadAnyNodeModulesSymlink = false;

    const run: RunLocalCommand = async (cmd, args, opts) => {
      if (cmd === 'pnpm' && args[0] === 'install') {
        pnpmInstalls.push({ cwd: opts?.cwd, args });
        mkdirSync(join(opts!.cwd!, 'node_modules'), { recursive: true });
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      if (args[0] === easCliPath) {
        const platform = args[args.indexOf('--platform') + 1]!;
        const cwd = opts?.cwd ?? '';
        easCwdsByPlatform.set(platform, cwd);
        if (platform === 'ios') {
          hadIsolatedGit = existsSync(join(cwd, '.git')) && cwd !== projectDir;
          hadAnyNodeModulesSymlink =
            existsSync(join(cwd, 'node_modules')) &&
            lstatSync(join(cwd, 'node_modules')).isSymbolicLink();
          writeFileSync(join(opts!.env!.EAS_LOCAL_BUILD_ARTIFACTS_DIR!, 'app.ipa'), 'ipa');
          const symbolsDir = join(
            opts!.env!.EAS_LOCAL_BUILD_WORKINGDIR!,
            'build/ios/build/ios-symbols',
          );
          mkdirSync(join(symbolsDir, 'package-abc'), { recursive: true });
          writeFileSync(join(symbolsDir, 'package.complete'), '{"directory":"package-abc"}');
          writeFileSync(join(symbolsDir, 'package-abc/dsyms.zip'), 'dsyms');
        } else {
          writeFileSync(join(opts!.env!.EAS_LOCAL_BUILD_ARTIFACTS_DIR!, 'app.apk'), 'apk');
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      if (cmd === 'git') {
        return defaultRunLocalCommand(cmd, args, opts);
      }
      if (args[0] === '-tq') return { stdout: '', stderr: '', exitCode: 0 };
      if (args[0] === '-Z1') {
        return {
          stdout: args[1]!.endsWith('.ipa')
            ? 'Payload/CherryStudio.app/Info.plist\n'
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
            CFBundleIdentifier: 'com.cherryai.cherrystudio-app',
            CFBundleVersion: '70',
          }),
          stderr: '',
          exitCode: 0,
        };
      }
      if (args[0] === 'verify') {
        return {
          stdout: 'Signer #1 certificate SHA-256 digest: abcdef\n',
          stderr: '',
          exitCode: 0,
        };
      }
      if (args[0] === 'dump' && args[1] === 'badging') {
        return {
          stdout: [
            "package: name='com.cherryai.cherrystudio_app' versionCode='128' versionName='0.6.2'",
            "uses-permission: name='android.permission.REQUEST_INSTALL_PACKAGES'",
          ].join('\n'),
          stderr: '',
          exitCode: 0,
        };
      }
      throw new Error(`Unexpected ${cmd} ${args.join(' ')}`);
    };

    const batchResult = await runLocalReleaseBatch({
      tag: 'v0.6.2',
      commitSha: headSha,
      runId: '9503',
      attempt: '1',
      projectDir,
      releaseRoot,
      easCliPath,
      localPluginPath,
      includeGooglePlay: false,
      env: makeReleaseEnv(),
      statfs: () => ({ bavail: 100 * 1024 ** 2, bsize: 1024 }),
      run,
      verifySymbols: jest.fn(async ({ archivePath, buildId }) => ({
        status: 'download-verified' as const,
        buildId,
        manifestSha256: 'abc',
        symbolPackage: { size: 5, sha256: 'def' },
        slices: 3,
        thirdPartySymbols: [],
        verifiedAt: '2026-11-23T06:00:00.000Z',
        expiry: 'unknown' as const,
        archivePath,
      })),
    });

    expect(batchResult.overallOk).toBe(true);
    // Android uses projectDir directly; only iOS clones and installs inside _workdirs/.../src.
    expect(easCwdsByPlatform.get('android')).toBe(projectDir);
    expect(easCwdsByPlatform.get('ios')).toMatch(
      /\/_workdirs\/cherry-studio-app-9503-ios-production-attempt1-[^/]+\/src$/,
    );
    expect(pnpmInstalls).toEqual([
      {
        cwd: easCwdsByPlatform.get('ios'),
        args: ['install', '--frozen-lockfile', '--prefer-offline'],
      },
    ]);
    expect(hadIsolatedGit).toBe(true);
    expect(hadAnyNodeModulesSymlink).toBe(false);
  });

  it('verifyArchivedIpa validates IPA SHA-256 against output and symbol manifest', async () => {
    const root = makeTempDir();
    const ipaPath = join(root, 'cherry-studio-0.6.2-ios.ipa');
    const ipaBytes = Buffer.from('verified-ipa-bytes');
    const sha256 = createHash('sha256').update(ipaBytes).digest('hex');
    writeFileSync(ipaPath, ipaBytes);

    const symbolsDir = join(root, 'ios-symbols');
    mkdirSync(join(symbolsDir, 'package-1'), { recursive: true });
    writeFileSync(join(symbolsDir, 'package.complete'), '{"directory":"package-1"}');
    writeFileSync(join(symbolsDir, 'package-1/manifest.json'), JSON.stringify({ ipa: { sha256 } }));

    await expect(
      verifyArchivedIpa({ ipaPath, expectedSha256: sha256, symbolsDir }),
    ).resolves.toEqual({ ipaPath, sha256, size: ipaBytes.length });

    writeFileSync(
      join(symbolsDir, 'package-1/manifest.json'),
      JSON.stringify({ ipa: { sha256: '0'.repeat(64) } }),
    );
    await expect(
      verifyArchivedIpa({ ipaPath, expectedSha256: sha256, symbolsDir }),
    ).rejects.toThrow('does not match archived IPA');

    writeFileSync(ipaPath, Buffer.from('swapped-ipa-bytes'));
    await expect(
      verifyArchivedIpa({ ipaPath, expectedSha256: sha256, symbolsDir }),
    ).rejects.toThrow('SHA-256 mismatch');
  });

  it('eas.json configures Google Play submission as production draft via EAS credentials', () => {
    const repo = resolve(__dirname, '../..');
    const easConfig = JSON.parse(readFileSync(join(repo, 'eas.json'), 'utf8')) as {
      submit?: Record<string, { android?: Record<string, unknown> }>;
    };
    expect(easConfig.submit?.['production-google-play']?.android).toEqual({
      applicationId: 'com.cherryai.cherrystudio_app',
      track: 'production',
      releaseStatus: 'draft',
    });
  });

  it.each([
    'success',
    'already-submitted',
    'tampered-aab',
    'tampered-archive',
    'submit-failed',
  ] as const)(
    'submit-google-play checks receipt, verifies archived AAB integrity, and records submit outcome (%s)',
    (scenario) => {
      const root = makeTempDir('cherry-play-submit-test-');
      const archiveDir = join(root, 'archive');
      mkdirSync(archiveDir, { recursive: true });
      const artifactName = 'cherry-studio-0.6.2-android.aab';
      const aabPath = join(archiveDir, artifactName);
      const originalBytes = Buffer.from('verified-aab-bytes');
      const expectedSha256 = createHash('sha256').update(originalBytes).digest('hex');
      writeFileSync(aabPath, originalBytes);
      writeFileSync(join(archiveDir, 'SHA256SUMS'), `${expectedSha256}  ${artifactName}\n`);
      if (scenario === 'tampered-aab') {
        writeFileSync(aabPath, Buffer.from('tampered-aab-bytes'));
      } else if (scenario === 'tampered-archive') {
        const tamperedBytes = Buffer.from('tampered-archive-bytes');
        const tamperedSha256 = createHash('sha256').update(tamperedBytes).digest('hex');
        writeFileSync(aabPath, tamperedBytes);
        writeFileSync(join(archiveDir, 'SHA256SUMS'), `${tamperedSha256}  ${artifactName}\n`);
      }

      const buildId = 'cherry-studio-app-999-android-google-play-attempt1';
      if (scenario === 'already-submitted') {
        recordSubmitReceipt({ buildDir: archiveDir, buildId, status: 'succeeded' });
      }

      const callsPath = join(root, 'calls');
      const summaryPath = join(root, 'summary');
      const githubOutputPath = join(root, 'github-output');
      writeFileSync(githubOutputPath, '');
      const stubBin = join(root, 'bin');
      mkdirSync(stubBin, { recursive: true });
      writeFileSync(
        join(stubBin, 'pnpm'),
        `#!/bin/bash
set -eu
[[ "$#" -eq 11 ]] || exit 2
[[ "$1 $2 $3 $4 $5 $6 $7 $8" == "exec eas submit --platform android --profile production-google-play --path" ]] || exit 2
[[ "$9" == "$GOOGLE_PLAY_ARTIFACT_PATH" ]] || exit 2
[[ "\${10} \${11}" == "--non-interactive --wait" ]] || exit 2
echo submit >> "$CALLS"
if [[ "$SCENARIO" == submit-failed ]]; then exit 1; fi
`,
        { mode: 0o700 },
      );

      const repo = resolve(__dirname, '../..');
      const workflow = parse(readFileSync(join(repo, '.github/workflows/release.yml'), 'utf8')) as {
        jobs: Record<
          string,
          {
            needs?: string[];
            environment?: string;
            'runs-on'?: string[];
            if?: string;
            outputs?: Record<string, string>;
            steps: Array<{ name: string; if?: string; run?: string }>;
          }
        >;
      };

      expect(workflow.jobs['build-native']?.outputs?.android_google_play_artifact_path).toBe(
        '${{ steps.build.outputs.android_google_play_artifact_path }}',
      );
      const playJob = workflow.jobs['submit-google-play'];
      expect(playJob).toBeDefined();
      expect(playJob.needs).toEqual(['validate', 'build-native']);
      expect(playJob.environment).toBe('local-release');
      expect(playJob['runs-on']).toEqual(['self-hosted', 'macOS', 'ARM64', 'release']);
      expect(playJob.if).toContain("needs.validate.outputs.is_prerelease != 'true'");
      expect(playJob.if).toContain(
        "needs.build-native.outputs.android_google_play_ready == 'true'",
      );

      const stepNames = playJob.steps.map((step) => step.name);
      const checkIdx = stepNames.indexOf('Check existing Google Play submit receipt');
      const verifyIdx = stepNames.indexOf('Verify archived Google Play AAB integrity');
      const submitIdx = stepNames.indexOf('Submit AAB as Google Play production draft');
      expect(checkIdx).toBeGreaterThan(-1);
      expect(verifyIdx).toBeGreaterThan(checkIdx);
      expect(submitIdx).toBeGreaterThan(verifyIdx);

      const checkStep = playJob.steps[checkIdx]!;
      const verifyStep = playJob.steps[verifyIdx]!;
      const submitStep = playJob.steps[submitIdx]!;
      expect(verifyStep.if).toContain("steps.receipt.outputs.already_submitted != 'true'");
      expect(submitStep.if).toContain("steps.receipt.outputs.already_submitted != 'true'");

      const sharedEnv = {
        ...process.env,
        PATH: `${stubBin}:${process.env.PATH ?? ''}`,
        GOOGLE_PLAY_ARCHIVE_DIR: archiveDir,
        GOOGLE_PLAY_ARTIFACT_NAME: artifactName,
        GOOGLE_PLAY_ARTIFACT_PATH: aabPath,
        GOOGLE_PLAY_EXPECTED_SHA256: expectedSha256,
        GOOGLE_PLAY_BUILD_ID: buildId,
        NATIVE_BUILD_VERSION: '277',
        GITHUB_OUTPUT: githubOutputPath,
        GITHUB_STEP_SUMMARY: summaryPath,
        CALLS: callsPath,
        SCENARIO: scenario,
      };

      const checkResult = spawnSync('bash', ['-eo', 'pipefail', '-c', checkStep.run!], {
        cwd: repo,
        encoding: 'utf8',
        env: sharedEnv,
      });
      expect(checkResult.status).toBe(0);
      const outputText = readFileSync(githubOutputPath, 'utf8');
      const alreadySubmitted = /already_submitted=(true|false)/.exec(outputText)?.[1];
      expect(alreadySubmitted).toBe(scenario === 'already-submitted' ? 'true' : 'false');

      if (alreadySubmitted === 'false') {
        const result = spawnSync(
          'bash',
          ['-eo', 'pipefail', '-c', `${verifyStep.run!}\n${submitStep.run!}`],
          {
            cwd: repo,
            encoding: 'utf8',
            env: sharedEnv,
          },
        );
        expect(result.status === 0).toBe(scenario === 'success');
      }

      const calls = existsSync(callsPath)
        ? readFileSync(callsPath, 'utf8').trim().split('\n').filter(Boolean)
        : [];
      const receipt = readSubmitReceipt(archiveDir);

      if (scenario === 'already-submitted') {
        expect(calls).toEqual([]);
        expect(receipt).toMatchObject({ status: 'succeeded', buildId });
      } else if (scenario === 'success') {
        expect(calls).toEqual(['submit']);
        expect(receipt).toMatchObject({ status: 'succeeded', buildId });
        expect(readFileSync(summaryPath, 'utf8')).toContain(
          `Uploaded Google Play build ${buildId} (versionCode 277)`,
        );
      } else if (scenario === 'tampered-aab' || scenario === 'tampered-archive') {
        expect(calls).toEqual([]);
        expect(receipt).toBeNull();
      } else {
        expect(calls).toEqual(['submit']);
        expect(receipt).toMatchObject({
          status: 'failed',
          buildId,
          message: 'eas submit exited nonzero',
        });
      }
    },
  );
});
