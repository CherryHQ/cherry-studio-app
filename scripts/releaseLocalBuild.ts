import { spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  appendFileSync,
  copyFileSync,
  cpSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statfsSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { sanitizeDiagnostic } from './uploadIosSymbols';
import { verifyIosSymbolPackage } from './verifyIosSymbolPackage';

export type ReleaseTargetId =
  | 'android-public'
  | 'android-google-play'
  | 'android-domestic-stores'
  | 'ios-production';

export interface ReleaseTargetConfig {
  id: ReleaseTargetId;
  platform: 'android' | 'ios';
  profile: string;
  channel: string;
  ext: 'apk' | 'aab' | 'ipa';
  minFreeDiskGb: number;
  expectInstallPermission: boolean | null;
  writeDomesticManifest: boolean;
}

export const RELEASE_TARGETS: Record<ReleaseTargetId, ReleaseTargetConfig> = {
  'android-public': {
    id: 'android-public',
    platform: 'android',
    profile: 'production',
    channel: 'production-apk',
    ext: 'apk',
    minFreeDiskGb: 30,
    expectInstallPermission: true,
    writeDomesticManifest: false,
  },
  'android-google-play': {
    id: 'android-google-play',
    platform: 'android',
    profile: 'production-google-play',
    channel: 'production-google-play',
    ext: 'aab',
    minFreeDiskGb: 30,
    expectInstallPermission: false,
    writeDomesticManifest: false,
  },
  'android-domestic-stores': {
    id: 'android-domestic-stores',
    platform: 'android',
    profile: 'production-domestic-stores',
    channel: 'production-domestic-stores',
    ext: 'apk',
    minFreeDiskGb: 30,
    expectInstallPermission: false,
    writeDomesticManifest: true,
  },
  'ios-production': {
    id: 'ios-production',
    platform: 'ios',
    profile: 'production',
    channel: 'production-ios',
    ext: 'ipa',
    minFreeDiskGb: 50,
    expectInstallPermission: null,
    writeDomesticManifest: false,
  },
};

export const REPO_RELEASE_NAMESPACE = 'cherry-studio-app';

export const REQUIRED_RELEASE_ENV_VARS = [
  'EXPO_TOKEN',
  'EXPO_PUBLIC_SENTRY_DSN',
  'SENTRY_AUTH_TOKEN',
  'CHERRY_CLOUD_CLIENT_SECRET',
  'CHERRYAI_CLIENT_SECRET',
  'CONFIG_SERVICE_ORIGIN',
  'EXPO_PUBLIC_GITHUB_OAUTH_CLIENT_ID',
  'EXPO_PUBLIC_GITHUB_OAUTH_CLIENT_SECRET',
] as const;

export const DEFAULT_ANDROID_GRADLE_OPTS =
  '-Dorg.gradle.jvmargs="-XX:MaxMetaspaceSize=1g -Xmx4g -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8" -Dorg.gradle.parallel=false -Dorg.gradle.daemon=false -Dorg.gradle.workers.max=2';
export const DEFAULT_PNPM_VIRTUAL_STORE_MAX_LENGTH = '40';

const INSTALL_PERMISSION = 'android.permission.REQUEST_INSTALL_PACKAGES';
const TAG_RE = /^v([0-9]+\.[0-9]+\.[0-9]+)(?:-([0-9A-Za-z.-]+))?$/;
const SHA_RE = /^[a-f0-9]{40}$/i;

export interface LocalCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export type RunLocalCommand = (
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    input?: string | Buffer;
    streamOutput?: boolean;
  },
) => Promise<LocalCommandResult>;

export const defaultRunLocalCommand: RunLocalCommand = async (command, args, options) => {
  const result = spawnSync(command, args, {
    cwd: options?.cwd,
    env: options?.env ?? process.env,
    input: options?.input,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: options?.streamOutput
      ? 'inherit'
      : [options?.input !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  return {
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
    exitCode: result.status,
  };
};

export function resolveTargetConfig(name: string): ReleaseTargetConfig {
  if (!(name in RELEASE_TARGETS)) {
    throw new Error(
      `Unknown release target: ${name}. Expected one of ${Object.keys(RELEASE_TARGETS).join(', ')}.`,
    );
  }
  return RELEASE_TARGETS[name as ReleaseTargetId];
}

export function resolveReleaseRoot(
  env: Record<string, string | undefined> = process.env,
  explicitRoot?: string,
): string {
  const raw =
    explicitRoot?.trim() || env.RUNNER_RELEASE_ROOT?.trim() || env.CHERRY_RELEASE_ROOT?.trim();
  return resolve(raw || join(homedir(), 'releases'));
}

export function resolveRepoReleasesDir(
  releaseRoot: string,
  repoNamespace = REPO_RELEASE_NAMESPACE,
): string {
  return join(releaseRoot, repoNamespace);
}

export function assertNoSecretLeak(text: string, secrets: Iterable<string>) {
  for (const secret of secrets) {
    if (secret && secret.length >= 4 && text.includes(secret)) {
      throw new Error('Refusing to persist manifest containing secret material.');
    }
  }
}

export function sanitizeSecrets(
  text: string,
  secrets: Iterable<string> = [],
  env: NodeJS.ProcessEnv = process.env,
): string {
  let redacted = text;
  for (const value of secrets) {
    if (value && value.length >= 4) {
      redacted = redacted.split(value).join('[redacted]');
    }
  }
  return sanitizeDiagnostic(redacted, env);
}

/**
 * Validates that all required release secrets and build configuration variables are present
 * in the process environment without echoing secret values.
 */
export function assertReleaseEnv(
  env: Record<string, string | undefined> = process.env,
): Record<(typeof REQUIRED_RELEASE_ENV_VARS)[number], string> {
  const missing: string[] = [];
  const resolved = {} as Record<(typeof REQUIRED_RELEASE_ENV_VARS)[number], string>;
  for (const key of REQUIRED_RELEASE_ENV_VARS) {
    const value = env[key]?.trim();
    if (!value) {
      missing.push(key);
    } else {
      resolved[key] = value;
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing required release environment variables: ${missing.join(', ')}`);
  }
  return resolved;
}

export function parseReleaseTag(tag: string): {
  tag: string;
  releaseVersion: string;
  baseVersion: string;
  isPrerelease: boolean;
} {
  const match = TAG_RE.exec(tag);
  if (!match) {
    throw new Error(`Invalid release tag: ${tag}. Expected v<major>.<minor>.<patch>[-prerelease].`);
  }
  return {
    tag,
    releaseVersion: tag.slice(1),
    baseVersion: match[1]!,
    isPrerelease: Boolean(match[2]),
  };
}

export function assertDiskSpace(
  targetPath: string,
  minFreeGb: number,
  statfs: (path: string) => { bavail: number | bigint; bsize: number | bigint } = (path) =>
    statfsSync(path),
): { availableBytes: number; requiredBytes: number } {
  let probe = resolve(targetPath);
  while (!existsSync(probe)) {
    const parent = dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  const stats = statfs(probe);
  const availableBytes = Number(stats.bavail) * Number(stats.bsize);
  const requiredBytes = minFreeGb * 1024 ** 3;
  if (availableBytes < requiredBytes) {
    const availableGb = (availableBytes / 1024 ** 3).toFixed(1);
    throw new Error(
      `Insufficient disk space at ${probe}: ${availableGb} GiB available, require at least ${minFreeGb} GiB.`,
    );
  }
  return { availableBytes, requiredBytes };
}

export async function fileEvidence(filePath: string): Promise<{ size: number; sha256: string }> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return { size: statSync(filePath).size, sha256: hash.digest('hex') };
}

function readAppIdentifiers(projectDir: string) {
  const appJson = JSON.parse(readFileSync(join(projectDir, 'app.json'), 'utf8')) as {
    expo?: {
      version?: string;
      android?: { package?: string };
      ios?: { bundleIdentifier?: string };
    };
  };
  const version = appJson.expo?.version;
  const androidPackage = appJson.expo?.android?.package;
  const iosBundleId = appJson.expo?.ios?.bundleIdentifier;
  if (!version || !androidPackage || !iosBundleId) {
    throw new Error('app.json is missing expo.version, android.package, or ios.bundleIdentifier.');
  }
  return { version, androidPackage, iosBundleId };
}

function resolveAndroidBuildToolsDir(env: NodeJS.ProcessEnv): string | undefined {
  const sdkRoot = env.ANDROID_HOME?.trim() || env.ANDROID_SDK_ROOT?.trim();
  if (!sdkRoot) return undefined;
  const buildToolsRoot = join(sdkRoot, 'build-tools');
  if (!existsSync(buildToolsRoot)) return undefined;
  const versions = readdirSync(buildToolsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const latest = versions.at(-1);
  return latest ? join(buildToolsRoot, latest) : undefined;
}

async function runChecked(
  run: RunLocalCommand,
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    input?: string | Buffer;
    secrets?: Iterable<string>;
  },
): Promise<LocalCommandResult> {
  const result = await run(command, args, options);
  if (result.exitCode !== 0) {
    const detail = sanitizeSecrets(result.stderr || result.stdout, options?.secrets, options?.env);
    throw new Error(
      `${basename(command)} ${args[0] ?? ''} exited with ${result.exitCode}${detail ? `: ${detail}` : ''}`,
    );
  }
  return result;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface InspectedArtifact {
  nativeBuildVersion: string;
  signingCertificateSha256: string | null;
  symbolVerification?: unknown;
  iosSymbolsStagedDir?: string;
}

async function inspectApk({
  artifactPath,
  expectedPackage,
  expectInstallPermission,
  env,
  run,
  secrets,
}: {
  artifactPath: string;
  expectedPackage: string;
  expectInstallPermission: boolean;
  env: NodeJS.ProcessEnv;
  run: RunLocalCommand;
  secrets: string[];
}): Promise<InspectedArtifact> {
  await runChecked(run, 'unzip', ['-tq', artifactPath], { env, secrets });
  const zipList = await runChecked(run, 'unzip', ['-Z1', artifactPath], { env, secrets });
  const entries = zipList.stdout.split(/\r?\n/).map((line) => line.trim());
  if (!entries.includes('AndroidManifest.xml')) {
    throw new Error(`APK is missing AndroidManifest.xml: ${artifactPath}`);
  }

  const buildToolsDir = resolveAndroidBuildToolsDir(env);
  const apksigner = buildToolsDir ? join(buildToolsDir, 'apksigner') : 'apksigner';
  const certs = await runChecked(run, apksigner, ['verify', '--print-certs', artifactPath], {
    env,
    secrets,
  });
  const certMatch = /Signer #1 certificate SHA-256 digest:\s*([a-f0-9]+)/i.exec(certs.stdout);
  if (!certMatch?.[1]) {
    throw new Error('Could not read APK Signer #1 SHA-256 certificate digest.');
  }

  let badging: LocalCommandResult;
  const aapt2 = buildToolsDir ? join(buildToolsDir, 'aapt2') : 'aapt2';
  const aapt = buildToolsDir ? join(buildToolsDir, 'aapt') : 'aapt';
  try {
    badging = await runChecked(run, aapt2, ['dump', 'badging', artifactPath], { env, secrets });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
    badging = await runChecked(run, aapt, ['dump', 'badging', artifactPath], { env, secrets });
  }

  const packageMatch = /^package:\s*name='([^']+)'/m.exec(badging.stdout);
  const versionCodeMatch = /\bversionCode='([^']+)'/.exec(badging.stdout);
  if (packageMatch?.[1] !== expectedPackage) {
    throw new Error(
      `APK package mismatch: expected ${expectedPackage}, got ${packageMatch?.[1] ?? 'unknown'}.`,
    );
  }
  if (!versionCodeMatch?.[1] || !/^[0-9]+$/.test(versionCodeMatch[1])) {
    throw new Error(`Could not extract numeric versionCode from APK badging output.`);
  }

  const hasInstallPermission = new RegExp(
    `uses-permission:\\s*name='${escapeRegex(INSTALL_PERMISSION)}'`,
  ).test(badging.stdout);
  if (hasInstallPermission !== expectInstallPermission) {
    throw new Error(
      expectInstallPermission
        ? `Public APK must declare ${INSTALL_PERMISSION}.`
        : `Store APK must not declare ${INSTALL_PERMISSION}.`,
    );
  }

  return {
    nativeBuildVersion: versionCodeMatch[1],
    signingCertificateSha256: certMatch[1].toLowerCase(),
  };
}

async function inspectAab({
  artifactPath,
  expectedPackage,
  env,
  run,
  secrets,
}: {
  artifactPath: string;
  expectedPackage: string;
  env: NodeJS.ProcessEnv;
  run: RunLocalCommand;
  secrets: string[];
}): Promise<InspectedArtifact> {
  await runChecked(run, 'unzip', ['-tq', artifactPath], { env, secrets });
  const zipList = await runChecked(run, 'unzip', ['-Z1', artifactPath], { env, secrets });
  const entries = zipList.stdout.split(/\r?\n/).map((line) => line.trim());
  if (!entries.includes('base/manifest/AndroidManifest.xml')) {
    throw new Error(`AAB is missing base/manifest/AndroidManifest.xml: ${artifactPath}`);
  }

  await runChecked(run, 'jarsigner', ['-verify', artifactPath], { env, secrets });
  const manifestResult = await runChecked(
    run,
    'bundletool',
    ['dump', 'manifest', `--bundle=${artifactPath}`],
    { env, secrets },
  );
  const manifestXml = manifestResult.stdout;
  const packageMatch = /\bpackage="([^"]+)"/.exec(manifestXml);
  const versionCodeMatch = /\bandroid:versionCode="([^"]+)"/.exec(manifestXml);
  if (packageMatch?.[1] !== expectedPackage) {
    throw new Error(
      `AAB package mismatch: expected ${expectedPackage}, got ${packageMatch?.[1] ?? 'unknown'}.`,
    );
  }
  if (!versionCodeMatch?.[1] || !/^[0-9]+$/.test(versionCodeMatch[1])) {
    throw new Error('Could not extract numeric android:versionCode from AAB manifest.');
  }
  if (manifestXml.includes(INSTALL_PERMISSION)) {
    throw new Error(`Google Play AAB must not declare ${INSTALL_PERMISSION}.`);
  }

  return {
    nativeBuildVersion: versionCodeMatch[1],
    signingCertificateSha256: null,
  };
}

async function inspectIpa({
  artifactPath,
  workdir,
  stagingDir,
  localBuildId,
  expectedBundleId,
  env,
  run,
  secrets,
  verifySymbols,
}: {
  artifactPath: string;
  workdir: string;
  stagingDir: string;
  localBuildId: string;
  expectedBundleId: string;
  env: NodeJS.ProcessEnv;
  run: RunLocalCommand;
  secrets: string[];
  verifySymbols: typeof verifyIosSymbolPackage;
}): Promise<InspectedArtifact> {
  await runChecked(run, 'unzip', ['-tq', artifactPath], { env, secrets });
  const zipList = await runChecked(run, 'unzip', ['-Z1', artifactPath], { env, secrets });
  const plistEntries = zipList.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^Payload\/[^/]+\.app\/Info\.plist$/.test(line));
  if (plistEntries.length !== 1) {
    throw new Error(`Expected exactly one app Info.plist in IPA, found ${plistEntries.length}.`);
  }

  const plistScratch = join(stagingDir, '.plist-extract');
  mkdirSync(plistScratch, { recursive: true });
  let parsedPlist: { CFBundleIdentifier?: string; CFBundleVersion?: string };
  try {
    await runChecked(
      run,
      'unzip',
      ['-q', '-o', '-j', artifactPath, plistEntries[0]!, '-d', plistScratch],
      {
        env,
        secrets,
      },
    );
    const extractedPlistPath = join(plistScratch, 'Info.plist');
    if (!existsSync(extractedPlistPath)) {
      throw new Error(`Failed to extract Info.plist from IPA: ${artifactPath}`);
    }
    const plistJson = await runChecked(
      run,
      'plutil',
      ['-convert', 'json', '-o', '-', extractedPlistPath],
      {
        env,
        secrets,
      },
    );
    parsedPlist = JSON.parse(plistJson.stdout) as {
      CFBundleIdentifier?: string;
      CFBundleVersion?: string;
    };
  } finally {
    rmSync(plistScratch, { recursive: true, force: true });
  }
  if (parsedPlist.CFBundleIdentifier !== expectedBundleId) {
    throw new Error(
      `IPA bundle identifier mismatch: expected ${expectedBundleId}, got ${parsedPlist.CFBundleIdentifier ?? 'unknown'}.`,
    );
  }
  const buildNumber = parsedPlist.CFBundleVersion?.trim();
  if (!buildNumber || !/^[0-9]+(?:\.[0-9]+)*$/.test(buildNumber)) {
    throw new Error(`Invalid CFBundleVersion in IPA Info.plist: ${buildNumber ?? 'missing'}.`);
  }

  const sourceSymbolsDir = join(workdir, 'build', 'ios', 'build', 'ios-symbols');
  if (!existsSync(sourceSymbolsDir) || !statSync(sourceSymbolsDir).isDirectory()) {
    throw new Error(`Missing staged iOS symbols directory at ${sourceSymbolsDir}`);
  }
  const stagedSymbolsDir = join(stagingDir, 'ios-symbols');
  cpSync(sourceSymbolsDir, stagedSymbolsDir, { recursive: true });
  const symbolVerification = await verifySymbols({
    archivePath: stagedSymbolsDir,
    buildId: localBuildId,
  });

  return {
    nativeBuildVersion: buildNumber,
    signingCertificateSha256: null,
    symbolVerification,
    iosSymbolsStagedDir: stagedSymbolsDir,
  };
}

function selectBuiltArtifact(artifactsDir: string, ext: 'apk' | 'aab' | 'ipa'): string {
  const suffix = `.${ext}`;
  const candidates = existsSync(artifactsDir)
    ? readdirSync(artifactsDir).filter(
        (name) => name.endsWith(suffix) && statSync(join(artifactsDir, name)).isFile(),
      )
    : [];
  if (candidates.length !== 1) {
    throw new Error(
      `Expected exactly one *${suffix} artifact in ${artifactsDir}, found ${candidates.length}.`,
    );
  }
  return join(artifactsDir, candidates[0]!);
}

function compareVersionsDesc(a: string, b: string): number {
  return b.localeCompare(a, undefined, { numeric: true });
}

function latestCompleteTimestampMs(versionDir: string): number {
  let latest = statSync(versionDir).mtimeMs;
  for (const channelEntry of readdirSync(versionDir, { withFileTypes: true })) {
    if (!channelEntry.isDirectory() || channelEntry.name.startsWith('.')) continue;
    const channelPath = join(versionDir, channelEntry.name);
    for (const buildEntry of readdirSync(channelPath, { withFileTypes: true })) {
      if (!buildEntry.isDirectory() || !buildEntry.name.startsWith('build-')) continue;
      const completePath = join(channelPath, buildEntry.name, '.complete');
      if (existsSync(completePath)) {
        latest = Math.max(latest, statSync(completePath).mtimeMs);
      }
    }
  }
  return latest;
}

export function pruneReleases({
  releaseRoot,
  repoNamespace = REPO_RELEASE_NAMESPACE,
  keepStable = 5,
  keepPrerelease = 1,
  activeVersion,
  dryRun = false,
}: {
  releaseRoot: string;
  repoNamespace?: string;
  keepStable?: number;
  keepPrerelease?: number;
  activeVersion?: string;
  dryRun?: boolean;
}): { kept: string[]; removed: string[] } {
  const releasesDir = resolveRepoReleasesDir(releaseRoot, repoNamespace);
  if (!existsSync(releasesDir)) return { kept: [], removed: [] };

  const entries = readdirSync(releasesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && TAG_RE.test(entry.name))
    .map((entry) => {
      const fullPath = join(releasesDir, entry.name);
      return {
        name: entry.name,
        fullPath,
        isPrerelease: entry.name.includes('-'),
        pinned: existsSync(join(fullPath, '.pin')) || entry.name === activeVersion,
        timestampMs: latestCompleteTimestampMs(fullPath),
      };
    })
    .sort((a, b) => {
      if (b.timestampMs !== a.timestampMs) return b.timestampMs - a.timestampMs;
      return compareVersionsDesc(a.name, b.name);
    });

  const kept: string[] = [];
  const removed: string[] = [];
  let stableCount = 0;
  let prereleaseCount = 0;

  for (const entry of entries) {
    if (entry.pinned) {
      kept.push(entry.name);
      continue;
    }
    if (entry.isPrerelease) {
      if (prereleaseCount < keepPrerelease) {
        prereleaseCount++;
        kept.push(entry.name);
      } else {
        if (!dryRun) rmSync(entry.fullPath, { recursive: true, force: true });
        removed.push(entry.name);
      }
      continue;
    }
    if (stableCount < keepStable) {
      stableCount++;
      kept.push(entry.name);
    } else {
      if (!dryRun) rmSync(entry.fullPath, { recursive: true, force: true });
      removed.push(entry.name);
    }
  }

  return { kept, removed };
}

function updateLatestSymlink(channelDir: string, buildDirName: string) {
  const latestLink = join(channelDir, 'latest');
  const tempLink = join(channelDir, `.latest-${process.pid}-${randomBytes(4).toString('hex')}`);
  try {
    symlinkSync(buildDirName, tempLink);
    renameSync(tempLink, latestLink);
  } finally {
    rmSync(tempLink, { force: true });
  }
}

function allocateFinalBuildDir(
  channelDir: string,
  nativeBuildVersion: string,
  shortSha: string,
  runId: string,
  attempt: string,
): string {
  const baseName = `build-${nativeBuildVersion}-${shortSha}-run${runId}`;
  const first = join(channelDir, baseName);
  if (!existsSync(first)) return first;
  const withAttempt = join(channelDir, `${baseName}-attempt${attempt}`);
  if (!existsSync(withAttempt)) return withAttempt;
  return join(channelDir, `${baseName}-attempt${attempt}-${randomBytes(3).toString('hex')}`);
}

export function writeGitHubOutputs(outputPath: string, values: Record<string, string>) {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(values)) {
    if (value.includes('\n') || value.includes('\r')) {
      const delimiter = `__CHERRY_EOF_${randomBytes(6).toString('hex')}__`;
      lines.push(`${key}<<${delimiter}\n${value}\n${delimiter}\n`);
    } else {
      lines.push(`${key}=${value}\n`);
    }
  }
  appendFileSync(outputPath, lines.join(''));
}

function resolveProjectBinaries(projectDir: string) {
  const requireFromProject = createRequire(resolve(projectDir, 'package.json'));
  return {
    easCliPath: requireFromProject.resolve('eas-cli/bin/run'),
    localPluginPath: requireFromProject.resolve('eas-cli-local-build-plugin/bin/run'),
  };
}

export interface RunLocalReleaseBuildOptions {
  target: ReleaseTargetId;
  tag: string;
  commitSha: string;
  runId: string;
  attempt: string;
  projectDir?: string;
  releaseRoot?: string;
  env?: NodeJS.ProcessEnv;
  run?: RunLocalCommand;
  statfs?: (path: string) => { bavail: number | bigint; bsize: number | bigint };
  verifySymbols?: typeof verifyIosSymbolPackage;
  localBuildId?: string;
  now?: () => Date;
  easCliPath?: string;
  localPluginPath?: string;
  keepStable?: number;
  keepPrerelease?: number;
}

export async function runLocalReleaseBuild(options: RunLocalReleaseBuildOptions) {
  const target = resolveTargetConfig(options.target);
  const parsedTag = parseReleaseTag(options.tag);
  if (!SHA_RE.test(options.commitSha)) {
    throw new Error(`Invalid commit SHA: ${options.commitSha}`);
  }
  const commitSha = options.commitSha.toLowerCase();
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const baseEnv = options.env ?? process.env;
  const run = options.run ?? defaultRunLocalCommand;
  const verifySymbols = options.verifySymbols ?? verifyIosSymbolPackage;
  const now = options.now ?? (() => new Date());
  const localBuildId = (options.localBuildId ?? randomUUID()).toLowerCase();

  const { version: appVersion, androidPackage, iosBundleId } = readAppIdentifiers(projectDir);
  if (parsedTag.baseVersion !== appVersion) {
    throw new Error(
      `Release tag ${parsedTag.tag} base version (${parsedTag.baseVersion}) does not match app.json expo.version (${appVersion}).`,
    );
  }

  const releaseRoot = resolveReleaseRoot(baseEnv, options.releaseRoot);
  const releaseSecrets = assertReleaseEnv(baseEnv);
  const secretValues = [
    ...Object.values(releaseSecrets),
    baseEnv.GH_TOKEN ?? '',
    baseEnv.GITHUB_TOKEN ?? '',
  ].filter(Boolean);

  assertDiskSpace(releaseRoot, target.minFreeDiskGb, options.statfs);

  const workdirsRoot = join(releaseRoot, '_workdirs');
  mkdirSync(workdirsRoot, { recursive: true });
  const jobSlug = `${REPO_RELEASE_NAMESPACE}-${options.runId}-${target.id}-attempt${options.attempt}-${randomBytes(4).toString('hex')}`;
  const workdir = join(workdirsRoot, `${jobSlug}-work`);
  const artifactsDir = join(workdirsRoot, `${jobSlug}-artifacts`);
  mkdirSync(artifactsDir, { recursive: true });

  const channelDir = join(resolveRepoReleasesDir(releaseRoot), parsedTag.tag, target.id);
  mkdirSync(channelDir, { recursive: true });
  const stagingDir = join(
    channelDir,
    `.staging-run${options.runId}-attempt${options.attempt}-${randomBytes(4).toString('hex')}`,
  );
  mkdirSync(stagingDir, { recursive: true });

  try {
    const resolvedBins =
      options.easCliPath && options.localPluginPath
        ? { easCliPath: options.easCliPath, localPluginPath: options.localPluginPath }
        : resolveProjectBinaries(projectDir);

    const buildEnv: NodeJS.ProcessEnv = {
      ...baseEnv,
      ...releaseSecrets,
      PNPM_CONFIG_VIRTUAL_STORE_DIR_MAX_LENGTH:
        baseEnv.PNPM_CONFIG_VIRTUAL_STORE_DIR_MAX_LENGTH ?? DEFAULT_PNPM_VIRTUAL_STORE_MAX_LENGTH,
      ...(target.platform === 'android'
        ? { GRADLE_OPTS: baseEnv.GRADLE_OPTS ?? DEFAULT_ANDROID_GRADLE_OPTS }
        : {}),
      EAS_LOCAL_BUILD_PLUGIN_PATH:
        baseEnv.EAS_LOCAL_BUILD_PLUGIN_PATH ?? resolvedBins.localPluginPath,
      EAS_LOCAL_BUILD_WORKINGDIR: workdir,
      EAS_LOCAL_BUILD_ARTIFACTS_DIR: artifactsDir,
      EAS_LOCAL_BUILD_SKIP_CLEANUP: '1',
      SENTRY_ALLOW_FAILURE: 'false',
      SENTRY_DISABLE_AUTO_UPLOAD: 'false',
      SENTRY_DISABLE_NATIVE_DEBUG_UPLOAD: 'false',
      ...(target.platform === 'ios'
        ? {
            CHERRY_LOCAL_RELEASE_SYMBOL_GATE: 'true',
            CHERRY_LOCAL_BUILD_ID: localBuildId,
            CHERRY_SOURCE_SHA: commitSha,
            SENTRY_DISABLE_XCODE_DEBUG_UPLOAD: 'false',
          }
        : {}),
    };
    delete buildEnv.EAS_LOCAL_BUILD_ARTIFACT_PATH;

    const buildResult = await run(
      process.execPath,
      [
        resolvedBins.easCliPath,
        'build',
        '--local',
        '--platform',
        target.platform,
        '--profile',
        target.profile,
        '--non-interactive',
      ],
      { cwd: projectDir, env: buildEnv, streamOutput: true },
    );
    if (buildResult.exitCode !== 0) {
      const detail = sanitizeSecrets(
        buildResult.stderr || buildResult.stdout,
        secretValues,
        buildEnv,
      );
      throw new Error(
        `eas build --local exited with ${buildResult.exitCode}${detail ? `: ${detail}` : ''}`,
      );
    }

    const builtArtifactPath = selectBuiltArtifact(artifactsDir, target.ext);
    const artifactName = `cherry-studio-${parsedTag.releaseVersion}-${target.platform}.${target.ext}`;
    const stagedArtifactPath = join(stagingDir, artifactName);
    copyFileSync(builtArtifactPath, stagedArtifactPath);

    const inspected =
      target.ext === 'apk'
        ? await inspectApk({
            artifactPath: stagedArtifactPath,
            expectedPackage: androidPackage,
            expectInstallPermission: target.expectInstallPermission === true,
            env: buildEnv,
            run,
            secrets: secretValues,
          })
        : target.ext === 'aab'
          ? await inspectAab({
              artifactPath: stagedArtifactPath,
              expectedPackage: androidPackage,
              env: buildEnv,
              run,
              secrets: secretValues,
            })
          : await inspectIpa({
              artifactPath: stagedArtifactPath,
              workdir,
              stagingDir,
              localBuildId,
              expectedBundleId: iosBundleId,
              env: buildEnv,
              run,
              secrets: secretValues,
              verifySymbols,
            });

    const evidence = await fileEvidence(stagedArtifactPath);
    writeFileSync(join(stagingDir, 'SHA256SUMS'), `${evidence.sha256}  ${artifactName}\n`);

    if (inspected.symbolVerification !== undefined) {
      writeFileSync(
        join(stagingDir, 'ios-symbol-verification.json'),
        `${JSON.stringify(inspected.symbolVerification, null, 2)}\n`,
      );
    }

    const builtAt = now().toISOString();
    const manifest = {
      schemaVersion: 1,
      releaseTag: parsedTag.tag,
      version: parsedTag.releaseVersion,
      baseVersion: appVersion,
      commitSha,
      target: target.id,
      platform: target.platform,
      profile: target.profile,
      channel: target.channel,
      bundleOrPackageId: target.platform === 'ios' ? iosBundleId : androidPackage,
      nativeBuildVersion: inspected.nativeBuildVersion,
      localBuildId,
      artifact: {
        filename: artifactName,
        size: evidence.size,
        sha256: evidence.sha256,
      },
      signing: {
        certificateSha256: inspected.signingCertificateSha256,
      },
      sentry: {
        autoUpload: true,
        verified: target.platform === 'ios',
        symbolPackageComplete: target.platform === 'ios',
      },
      githubRun: {
        runId: options.runId,
        attempt: options.attempt,
      },
      builtAt,
    };
    const serializedManifest = `${JSON.stringify(manifest, null, 2)}\n`;
    assertNoSecretLeak(serializedManifest, secretValues);
    writeFileSync(join(stagingDir, 'build-manifest.json'), serializedManifest);

    if (target.writeDomesticManifest) {
      const domesticManifest = {
        buildId: localBuildId,
        commit: commitSha,
        packageName: androidPackage,
        appVersion,
        versionCode: inspected.nativeBuildVersion,
        channel: target.channel,
        signingCertificateSha256: inspected.signingCertificateSha256,
      };
      const serializedDomestic = `${JSON.stringify(domesticManifest, null, 2)}\n`;
      assertNoSecretLeak(serializedDomestic, secretValues);
      writeFileSync(join(stagingDir, 'release-manifest.json'), serializedDomestic);
    }

    const finalDir = allocateFinalBuildDir(
      channelDir,
      inspected.nativeBuildVersion,
      commitSha.slice(0, 7),
      options.runId,
      options.attempt,
    );
    renameSync(stagingDir, finalDir);
    writeFileSync(
      join(finalDir, '.complete'),
      `${JSON.stringify({ buildId: localBuildId, completedAt: now().toISOString() }, null, 2)}\n`,
    );
    updateLatestSymlink(channelDir, basename(finalDir));

    const pruneResult = pruneReleases({
      releaseRoot,
      keepStable: options.keepStable ?? 5,
      keepPrerelease: options.keepPrerelease ?? 1,
      activeVersion: parsedTag.tag,
    });

    return {
      target: target.id,
      buildId: localBuildId,
      archiveDir: finalDir,
      artifactName,
      artifactPath: join(finalDir, artifactName),
      symbolsDir: target.platform === 'ios' ? join(finalDir, 'ios-symbols') : '',
      nativeBuildVersion: inspected.nativeBuildVersion,
      sha256: evidence.sha256,
      pruned: pruneResult.removed,
    };
  } finally {
    rmSync(workdir, { recursive: true, force: true });
    rmSync(artifactsDir, { recursive: true, force: true });
    rmSync(stagingDir, { recursive: true, force: true });
  }
}

export async function findCompleteBuild({
  target: targetId,
  tag,
  commitSha,
  releaseRoot,
}: {
  target: ReleaseTargetId;
  tag: string;
  commitSha: string;
  releaseRoot: string;
}) {
  const target = resolveTargetConfig(targetId);
  const parsedTag = parseReleaseTag(tag);
  if (!SHA_RE.test(commitSha)) {
    throw new Error(`Invalid commit SHA: ${commitSha}`);
  }
  const normalizedSha = commitSha.toLowerCase();
  const channelDir = join(resolveRepoReleasesDir(releaseRoot), parsedTag.tag, target.id);
  if (!existsSync(channelDir)) return { found: false as const };

  const candidates = readdirSync(channelDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('build-'))
    .map((entry) => join(channelDir, entry.name))
    .filter(
      (dir) => existsSync(join(dir, '.complete')) && existsSync(join(dir, 'build-manifest.json')),
    )
    .sort(
      (a, b) => statSync(join(b, '.complete')).mtimeMs - statSync(join(a, '.complete')).mtimeMs,
    );

  for (const dir of candidates) {
    try {
      const manifest = JSON.parse(readFileSync(join(dir, 'build-manifest.json'), 'utf8')) as {
        releaseTag?: string;
        commitSha?: string;
        target?: string;
        localBuildId?: string;
        nativeBuildVersion?: string;
        artifact?: { filename?: string; sha256?: string };
      };
      if (
        manifest.releaseTag !== parsedTag.tag ||
        manifest.commitSha?.toLowerCase() !== normalizedSha ||
        manifest.target !== target.id ||
        !manifest.artifact?.filename ||
        !manifest.artifact?.sha256 ||
        !manifest.localBuildId ||
        !manifest.nativeBuildVersion
      ) {
        continue;
      }
      const artifactPath = join(dir, manifest.artifact.filename);
      if (!existsSync(artifactPath) || !statSync(artifactPath).isFile()) continue;
      if (target.platform === 'ios' && !existsSync(join(dir, 'ios-symbols', 'package.complete'))) {
        continue;
      }
      const liveEvidence = await fileEvidence(artifactPath);
      if (liveEvidence.sha256 !== manifest.artifact.sha256) continue;
      return {
        found: true as const,
        buildId: manifest.localBuildId,
        archiveDir: dir,
        artifactPath,
        symbolsDir: target.platform === 'ios' ? join(dir, 'ios-symbols') : '',
        nativeBuildVersion: manifest.nativeBuildVersion,
      };
    } catch {
      continue;
    }
  }
  return { found: false as const };
}

export function recordSubmitReceipt({
  buildDir,
  buildId,
  status,
  message,
  now = () => new Date(),
}: {
  buildDir: string;
  buildId?: string;
  status: 'succeeded' | 'failed';
  message?: string;
  now?: () => Date;
}) {
  if (!existsSync(buildDir) || !statSync(buildDir).isDirectory()) {
    throw new Error(`Archived build directory does not exist: ${buildDir}`);
  }
  const receipt = {
    schemaVersion: 1,
    buildId: buildId ?? null,
    status,
    message: message ? sanitizeDiagnostic(message) : null,
    recordedAt: now().toISOString(),
  };
  writeFileSync(join(buildDir, 'submit-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'build') {
    const { values } = parseArgs({
      args: rest,
      options: {
        target: { type: 'string' },
        tag: { type: 'string' },
        commit: { type: 'string' },
        'run-id': { type: 'string' },
        attempt: { type: 'string' },
        root: { type: 'string' },
        'github-output': { type: 'string' },
        summary: { type: 'string' },
      },
      strict: true,
    });
    if (!values.target || !values.tag || !values.commit) {
      throw new Error('Missing required flags: --target, --tag, --commit.');
    }
    const result = await runLocalReleaseBuild({
      target: resolveTargetConfig(values.target).id,
      tag: values.tag,
      commitSha: values.commit,
      runId: values['run-id'] ?? 'manual',
      attempt: values.attempt ?? '1',
      releaseRoot: values.root,
    });
    if (values['github-output']) {
      writeGitHubOutputs(values['github-output'], {
        build_id: result.buildId,
        archive_dir: result.archiveDir,
        artifact_name: result.artifactName,
        artifact_path: result.artifactPath,
        symbols_dir: result.symbolsDir,
        native_build_version: result.nativeBuildVersion,
      });
    }
    if (values.summary) {
      appendFileSync(
        values.summary,
        `- \`${result.target}\` build \`${result.buildId}\` (native \`${result.nativeBuildVersion}\`) archived to \`${result.archiveDir}\`\n`,
      );
    }
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'find-complete') {
    const { values } = parseArgs({
      args: rest,
      options: {
        target: { type: 'string' },
        tag: { type: 'string' },
        commit: { type: 'string' },
        root: { type: 'string' },
        'github-output': { type: 'string' },
      },
      strict: true,
    });
    if (!values.target || !values.tag || !values.commit) {
      throw new Error('Missing required flags: --target, --tag, --commit.');
    }
    const releaseRoot = resolveReleaseRoot(process.env, values.root);
    const result = await findCompleteBuild({
      target: resolveTargetConfig(values.target).id,
      tag: values.tag,
      commitSha: values.commit,
      releaseRoot,
    });
    if (values['github-output']) {
      writeGitHubOutputs(
        values['github-output'],
        result.found
          ? {
              found: 'true',
              build_id: result.buildId,
              archive_dir: result.archiveDir,
              artifact_path: result.artifactPath,
              symbols_dir: result.symbolsDir,
              native_build_version: result.nativeBuildVersion,
            }
          : { found: 'false' },
      );
    }
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'record-submit') {
    const { values } = parseArgs({
      args: rest,
      options: {
        'build-dir': { type: 'string' },
        'build-id': { type: 'string' },
        status: { type: 'string' },
        message: { type: 'string' },
      },
      strict: true,
    });
    if (!values['build-dir'] || (values.status !== 'succeeded' && values.status !== 'failed')) {
      throw new Error('Usage: record-submit --build-dir <dir> --status <succeeded|failed>');
    }
    const receipt = recordSubmitReceipt({
      buildDir: resolve(values['build-dir']),
      buildId: values['build-id'],
      status: values.status,
      message: values.message,
    });
    console.log(JSON.stringify(receipt, null, 2));
    return;
  }

  if (command === 'prune') {
    const { values } = parseArgs({
      args: rest,
      options: {
        root: { type: 'string' },
        keep: { type: 'string' },
        'keep-prerelease': { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
      },
      strict: true,
    });
    const keepStable = values.keep ? Number.parseInt(values.keep, 10) : 5;
    const keepPrerelease = values['keep-prerelease']
      ? Number.parseInt(values['keep-prerelease'], 10)
      : 1;
    if (!Number.isInteger(keepStable) || keepStable < 1) {
      throw new Error('--keep must be a positive integer.');
    }
    if (!Number.isInteger(keepPrerelease) || keepPrerelease < 0) {
      throw new Error('--keep-prerelease must be a non-negative integer.');
    }
    const result = pruneReleases({
      releaseRoot: resolveReleaseRoot(process.env, values.root),
      keepStable,
      keepPrerelease,
      dryRun: values['dry-run'],
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  throw new Error(
    'Usage: releaseLocalBuild.ts <build|find-complete|record-submit|prune> [options]',
  );
}

if (basename(process.argv[1] ?? '') === 'releaseLocalBuild.ts') {
  void main().catch((error) => {
    console.error(sanitizeDiagnostic(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
}
