import { spawn, type StdioOptions } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  appendFileSync,
  chmodSync,
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
import { StringDecoder } from 'node:string_decoder';
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
  '-Dorg.gradle.parallel=true -Dorg.gradle.daemon=false -Dorg.gradle.workers.max=12';
export const DEFAULT_PNPM_VIRTUAL_STORE_MAX_LENGTH = '40';

const INSTALL_PERMISSION = 'android.permission.REQUEST_INSTALL_PACKAGES';
const TAG_RE = /^v([0-9]+\.[0-9]+\.[0-9]+)(?:-([0-9A-Za-z.-]+))?$/;
const SHA_RE = /^[a-f0-9]{40}$/i;

export interface LocalCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

const MAX_CAPTURE_BYTES = 64 * 1024 * 1024;
const MAX_STREAM_TAIL_CHARS = 256 * 1024;

export function redactSecretsInStream(
  text: string,
  secrets: Iterable<string> = [],
  env: NodeJS.ProcessEnv = process.env,
): string {
  const candidates = new Set<string>();
  const addSecret = (value: string | undefined) => {
    if (!value || value.length < 4) return;
    candidates.add(value);
    try {
      const parsed = new URL(value);
      for (const cred of [parsed.username, parsed.password]) {
        for (const part of [cred, decodeURIComponent(cred)]) {
          if (part && part.length >= 4) candidates.add(part);
        }
      }
    } catch {
      // Non-URL secret value.
    }
  };
  for (const value of secrets) addSecret(value);
  for (const [key, value] of Object.entries(env)) {
    if (value && /token|secret|password|dsn/i.test(key)) {
      addSecret(value);
    }
  }
  let redacted = text;
  // Mask longest values first so full URLs/DSNs redact before component secrets.
  for (const value of [...candidates].sort((a, b) => b.length - a.length)) {
    redacted = redacted.split(value).join('[redacted]');
  }
  return redacted
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b(key|token|sig|signature|X-Amz-[a-z0-9-]+)=([^\s&#"']*)/gi, '$1=[redacted]')
    .replace(/(?:sntrys_|sntryu_)[a-zA-Z0-9_]+/g, '[redacted]');
}

export type RunLocalCommand = (
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    input?: string | Buffer;
    streamOutput?: boolean;
    logPrefix?: string;
    secrets?: Iterable<string>;
  },
) => Promise<LocalCommandResult>;

function appendRollingTail(current: string, chunk: string): string {
  const combined = current + chunk;
  return combined.length > MAX_STREAM_TAIL_CHARS
    ? combined.slice(combined.length - MAX_STREAM_TAIL_CHARS)
    : combined;
}

function createStreamLineWriter(
  target: NodeJS.WriteStream,
  { prefix, redact }: { prefix?: string; redact: (line: string) => string },
) {
  const decoder = new StringDecoder('utf8');
  let remainder = '';
  return {
    push(chunk: Buffer) {
      const text = remainder + decoder.write(chunk);
      const lines = text.split('\n');
      remainder = lines.pop() ?? '';
      let emitted = '';
      for (const line of lines) {
        const clean = line.endsWith('\r') ? line.slice(0, -1) : line;
        const safeLine = redact(clean);
        target.write(prefix ? `[${prefix}] ${safeLine}\n` : `${safeLine}\n`);
        emitted += `${safeLine}\n`;
      }
      return emitted;
    },
    flush() {
      const finalText = remainder + decoder.end();
      remainder = '';
      if (finalText.length > 0) {
        const clean = finalText.endsWith('\r') ? finalText.slice(0, -1) : finalText;
        const safeLine = redact(clean);
        target.write(prefix ? `[${prefix}] ${safeLine}\n` : `${safeLine}\n`);
        return safeLine;
      }
      return '';
    },
  };
}

export const defaultRunLocalCommand: RunLocalCommand = async (command, args, options) => {
  const streamOutput = Boolean(options?.streamOutput);
  const logPrefix = options?.logPrefix?.trim() || undefined;
  const redact = (line: string) => redactSecretsInStream(line, options?.secrets, options?.env);

  return await new Promise<LocalCommandResult>((resolvePromise, rejectPromise) => {
    // Always pipe streamed output so secrets are redacted line-by-line even across chunk boundaries.
    const stdio: StdioOptions = streamOutput
      ? ['ignore', 'pipe', 'pipe']
      : [options?.input !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'];

    const child = spawn(command, args, {
      cwd: options?.cwd,
      env: options?.env ?? process.env,
      stdio,
    });

    let settled = false;
    const finishWithError = (error: unknown) => {
      if (settled) return;
      settled = true;
      rejectPromise(error instanceof Error ? error : new Error(String(error)));
    };

    child.on('error', finishWithError);

    let stdoutTail = '';
    let stderrTail = '';
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let totalBytes = 0;

    if (streamOutput) {
      const stdoutWriter = createStreamLineWriter(process.stdout, { prefix: logPrefix, redact });
      const stderrWriter = createStreamLineWriter(process.stderr, { prefix: logPrefix, redact });

      child.stdout?.on('data', (chunk: Buffer) => {
        const text = stdoutWriter.push(chunk);
        if (text) stdoutTail = appendRollingTail(stdoutTail, text);
      });
      child.stdout?.on('end', () => {
        const tail = stdoutWriter.flush();
        if (tail) stdoutTail = appendRollingTail(stdoutTail, tail);
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        const text = stderrWriter.push(chunk);
        if (text) stderrTail = appendRollingTail(stderrTail, text);
      });
      child.stderr?.on('end', () => {
        const tail = stderrWriter.flush();
        if (tail) stderrTail = appendRollingTail(stderrTail, tail);
      });
    } else {
      child.stdout?.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_CAPTURE_BYTES) {
          child.kill('SIGTERM');
          finishWithError(
            new Error(`${basename(command)} output exceeded ${MAX_CAPTURE_BYTES} bytes.`),
          );
          return;
        }
        stdoutChunks.push(chunk);
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_CAPTURE_BYTES) {
          child.kill('SIGTERM');
          finishWithError(
            new Error(`${basename(command)} output exceeded ${MAX_CAPTURE_BYTES} bytes.`),
          );
          return;
        }
        stderrChunks.push(chunk);
      });

      if (options?.input !== undefined && child.stdin) {
        child.stdin.on('error', () => {
          // Child termination surfaces via close exitCode.
        });
        child.stdin.end(options.input);
      }
    }

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (streamOutput) {
        resolvePromise({ stdout: stdoutTail, stderr: stderrTail, exitCode: code });
        return;
      }
      resolvePromise({
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        exitCode: code,
      });
    });
  });
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
  symbolUploadPending?: boolean;
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

  const verifyResult = await runChecked(
    run,
    'jarsigner',
    ['-J-Duser.language=en', '-J-Duser.country=US', '-verify', '-verbose:summary', artifactPath],
    {
      env: { ...env, LC_ALL: 'C', LANG: 'C' },
      secrets,
    },
  );
  const verifyOutput = `${verifyResult.stdout}\n${verifyResult.stderr}`;
  if (
    !/jar verified\./i.test(verifyResult.stdout) ||
    /contains unsigned entries|\bjar is unsigned\b/i.test(verifyOutput)
  ) {
    throw new Error(
      `AAB signature verification failed or found unsigned entries: ${sanitizeSecrets(verifyOutput, secrets, env)}`,
    );
  }
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
  const hasPendingUpload =
    existsSync(join(stagedSymbolsDir, 'upload.pending')) &&
    !existsSync(join(stagedSymbolsDir, 'package.complete'));
  if (hasPendingUpload) {
    return {
      nativeBuildVersion: buildNumber,
      signingCertificateSha256: null,
      iosSymbolsStagedDir: stagedSymbolsDir,
      symbolUploadPending: true,
    };
  }
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

const STALE_UNTRACKED_WORKDIR_AGE_MS = 5 * 60_000;

export function cleanupStaleWorkdirs(workdirsRoot: string, nowMs = Date.now()): string[] {
  if (!existsSync(workdirsRoot)) return [];
  const removed: string[] = [];
  for (const entry of readdirSync(workdirsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(`${REPO_RELEASE_NAMESPACE}-`)) {
      continue;
    }
    const entryPath = join(workdirsRoot, entry.name);
    const pidFile = join(entryPath, '.owner.pid');
    let shouldRemove = false;
    if (existsSync(pidFile)) {
      const pid = Number.parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
      if (Number.isInteger(pid) && pid > 0) {
        if (pid === process.pid) {
          continue;
        }
        try {
          process.kill(pid, 0);
          continue;
        } catch (error) {
          if ((error as NodeJS.ErrnoException)?.code === 'ESRCH') {
            shouldRemove = true;
          } else {
            continue;
          }
        }
      } else if (statSync(entryPath).mtimeMs < nowMs - STALE_UNTRACKED_WORKDIR_AGE_MS) {
        shouldRemove = true;
      }
    } else if (statSync(entryPath).mtimeMs < nowMs - STALE_UNTRACKED_WORKDIR_AGE_MS) {
      shouldRemove = true;
    }

    if (shouldRemove) {
      rmSync(entryPath, { recursive: true, force: true });
      removed.push(entry.name);
    }
  }
  return removed;
}

async function verifyGitWorkspaceMatchesCommit({
  projectDir,
  expectedSha,
  env,
  run,
  secrets,
}: {
  projectDir: string;
  expectedSha: string;
  env: NodeJS.ProcessEnv;
  run: RunLocalCommand;
  secrets: string[];
}) {
  const headResult = await runChecked(run, 'git', ['rev-parse', 'HEAD'], {
    cwd: projectDir,
    env,
    secrets,
  });
  const actualSha = headResult.stdout.trim().toLowerCase();
  if (actualSha !== expectedSha) {
    throw new Error(
      `Refusing release build: git HEAD (${actualSha || 'unknown'}) does not match --commit (${expectedSha}).`,
    );
  }
  const statusResult = await runChecked(
    run,
    'git',
    ['status', '--porcelain', '--untracked-files=normal'],
    {
      cwd: projectDir,
      env,
      secrets,
    },
  );
  if (statusResult.stdout.trim().length > 0) {
    throw new Error(
      `Refusing release build from dirty git working tree in ${projectDir}. Commit or clean changes first.`,
    );
  }
}

async function cloneIsolatedProjectDir({
  projectDir,
  isolatedDir,
  env,
  run,
  secrets,
}: {
  projectDir: string;
  isolatedDir: string;
  env: NodeJS.ProcessEnv;
  run: RunLocalCommand;
  secrets: string[];
}) {
  await runChecked(
    run,
    'git',
    ['clone', '-q', '--no-hardlinks', '--depth', '1', `file://${projectDir}`, isolatedDir],
    { env, secrets },
  );
  // Install project-local dependencies so @expo/fingerprint resolves paths inside isolatedDir rather than symlink targets.
  if (existsSync(join(isolatedDir, 'pnpm-lock.yaml'))) {
    await runChecked(run, 'pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], {
      cwd: isolatedDir,
      env: {
        ...env,
        PNPM_CONFIG_VIRTUAL_STORE_DIR_MAX_LENGTH:
          env.PNPM_CONFIG_VIRTUAL_STORE_DIR_MAX_LENGTH ?? DEFAULT_PNPM_VIRTUAL_STORE_MAX_LENGTH,
      },
      secrets,
    });
  }
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
  skipPrune?: boolean;
  logPrefix?: string;
  isolateGitRepo?: boolean;
  verifyGitHead?: boolean;
  skipStaleWorkdirCleanup?: boolean;
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
    baseEnv.GITCODE_TOKEN ?? '',
  ].filter(Boolean);

  if (options.verifyGitHead !== false && existsSync(join(projectDir, '.git'))) {
    await verifyGitWorkspaceMatchesCommit({
      projectDir,
      expectedSha: commitSha,
      env: baseEnv,
      run,
      secrets: secretValues,
    });
  }

  assertDiskSpace(releaseRoot, target.minFreeDiskGb, options.statfs);

  const workdirsRoot = join(releaseRoot, '_workdirs');
  mkdirSync(workdirsRoot, { recursive: true, mode: 0o700 });
  chmodSync(workdirsRoot, 0o700);
  if (!options.skipStaleWorkdirCleanup) {
    cleanupStaleWorkdirs(workdirsRoot, now().getTime());
  }

  const jobSlug = `${REPO_RELEASE_NAMESPACE}-${options.runId}-${target.id}-attempt${options.attempt}-${randomBytes(4).toString('hex')}`;
  const jobDir = join(workdirsRoot, jobSlug);
  mkdirSync(jobDir, { recursive: true, mode: 0o700 });
  chmodSync(jobDir, 0o700);
  writeFileSync(join(jobDir, '.owner.pid'), `${process.pid}\n`, { mode: 0o600 });

  const workdir = join(jobDir, 'work');
  const artifactsDir = join(jobDir, 'artifacts');
  mkdirSync(artifactsDir, { recursive: true, mode: 0o700 });

  const channelDir = join(resolveRepoReleasesDir(releaseRoot), parsedTag.tag, target.id);
  mkdirSync(channelDir, { recursive: true });
  const stagingDir = join(
    channelDir,
    `.staging-run${options.runId}-attempt${options.attempt}-${randomBytes(4).toString('hex')}`,
  );
  mkdirSync(stagingDir, { recursive: true });

  try {
    let buildProjectDir = projectDir;
    if (options.isolateGitRepo && existsSync(join(projectDir, '.git'))) {
      const isolatedDir = join(jobDir, 'src');
      await cloneIsolatedProjectDir({
        projectDir,
        isolatedDir,
        env: baseEnv,
        run,
        secrets: secretValues,
      });
      buildProjectDir = isolatedDir;
    }

    const binsProjectDir = existsSync(join(buildProjectDir, 'node_modules'))
      ? buildProjectDir
      : projectDir;
    const resolvedBins =
      options.easCliPath && options.localPluginPath
        ? { easCliPath: options.easCliPath, localPluginPath: options.localPluginPath }
        : resolveProjectBinaries(binsProjectDir);

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
      SENTRY_ALLOW_FAILURE: 'false',
      SENTRY_DISABLE_AUTO_UPLOAD: 'false',
      SENTRY_DISABLE_NATIVE_DEBUG_UPLOAD: 'false',
      ...(target.platform === 'ios'
        ? {
            // Retain workdir briefly so inspectIpa can stage and verify ios-symbols before finally cleans up.
            EAS_LOCAL_BUILD_SKIP_CLEANUP: '1',
            CHERRY_LOCAL_RELEASE_SYMBOL_GATE: 'true',
            CHERRY_LOCAL_BUILD_ID: localBuildId,
            CHERRY_SOURCE_SHA: commitSha,
            SENTRY_DISABLE_XCODE_DEBUG_UPLOAD: 'false',
          }
        : {}),
    };
    delete buildEnv.EAS_LOCAL_BUILD_ARTIFACT_PATH;
    if (target.platform === 'android') {
      delete buildEnv.EAS_LOCAL_BUILD_SKIP_CLEANUP;
    }

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
      {
        cwd: buildProjectDir,
        env: buildEnv,
        streamOutput: true,
        logPrefix: options.logPrefix,
        secrets: secretValues,
      },
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
        verified: target.platform === 'ios' && !inspected.symbolUploadPending,
        symbolPackageComplete: target.platform === 'ios' && !inspected.symbolUploadPending,
        ...(inspected.symbolUploadPending ? { pendingUpload: true } : {}),
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

    if (inspected.symbolUploadPending) {
      const pendingDir = join(
        channelDir,
        `pending-symbols-${inspected.nativeBuildVersion}-${commitSha.slice(0, 7)}-run${options.runId}-attempt${options.attempt}-${randomBytes(3).toString('hex')}`,
      );
      renameSync(stagingDir, pendingDir);
      throw new Error(
        `iOS symbol upload to Sentry is pending verification. Retained signed IPA and original symbols at ${pendingDir} (symbols: ${join(pendingDir, 'ios-symbols')}, buildId: ${localBuildId}). Retry with \`node --import tsx scripts/releaseLocalBuild.ts recover-ios --pending-dir ${pendingDir}\` once Sentry is available, then re-run failed jobs.`,
      );
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

    const pruneResult = options.skipPrune
      ? { kept: [], removed: [] }
      : pruneReleases({
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
    rmSync(jobDir, { recursive: true, force: true });
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
      const checksumPath = join(dir, 'SHA256SUMS');
      if (!existsSync(checksumPath) || !statSync(checksumPath).isFile()) continue;
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
        artifactName: manifest.artifact.filename,
        artifactPath,
        symbolsDir: target.platform === 'ios' ? join(dir, 'ios-symbols') : '',
        nativeBuildVersion: manifest.nativeBuildVersion,
        sha256: liveEvidence.sha256,
      };
    } catch {
      continue;
    }
  }
  return { found: false as const };
}

export interface SubmitReceipt {
  schemaVersion: number;
  buildId: string | null;
  status: 'succeeded' | 'failed';
  message: string | null;
  recordedAt: string;
}

export function readSubmitReceipt(buildDir: string): SubmitReceipt | null {
  const receiptPath = join(buildDir, 'submit-receipt.json');
  if (!existsSync(receiptPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(receiptPath, 'utf8')) as Partial<SubmitReceipt>;
    if (parsed.status !== 'succeeded' && parsed.status !== 'failed') {
      return null;
    }
    return {
      schemaVersion: typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 1,
      buildId: typeof parsed.buildId === 'string' ? parsed.buildId : null,
      status: parsed.status,
      message: typeof parsed.message === 'string' ? parsed.message : null,
      recordedAt: typeof parsed.recordedAt === 'string' ? parsed.recordedAt : '',
    };
  } catch {
    return null;
  }
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
  const receipt: SubmitReceipt = {
    schemaVersion: 1,
    buildId: buildId ?? null,
    status,
    message: message ? sanitizeDiagnostic(message) : null,
    recordedAt: now().toISOString(),
  };
  const receiptPath = join(buildDir, 'submit-receipt.json');
  const tempPath = join(
    buildDir,
    `.submit-receipt-${process.pid}-${randomBytes(4).toString('hex')}.tmp`,
  );
  try {
    writeFileSync(tempPath, `${JSON.stringify(receipt, null, 2)}\n`);
    renameSync(tempPath, receiptPath);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
  return receipt;
}

export async function verifyArchivedIpa({
  ipaPath,
  expectedSha256,
  symbolsDir,
}: {
  ipaPath: string;
  expectedSha256: string;
  symbolsDir?: string;
}): Promise<{ ipaPath: string; sha256: string; size: number }> {
  const resolvedIpa = resolve(ipaPath);
  if (!existsSync(resolvedIpa) || !statSync(resolvedIpa).isFile()) {
    throw new Error(`Archived IPA does not exist: ${resolvedIpa}`);
  }
  const normalizedExpected = expectedSha256.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalizedExpected)) {
    throw new Error(`Invalid expected IPA SHA-256: ${expectedSha256}`);
  }
  const liveEvidence = await fileEvidence(resolvedIpa);
  if (liveEvidence.sha256 !== normalizedExpected) {
    throw new Error(
      `Archived IPA SHA-256 mismatch: expected ${normalizedExpected}, got ${liveEvidence.sha256}.`,
    );
  }

  if (symbolsDir?.trim()) {
    const resolvedSymbols = resolve(symbolsDir);
    const pointerPath = join(resolvedSymbols, 'package.complete');
    if (!existsSync(pointerPath) || !statSync(pointerPath).isFile()) {
      throw new Error(`Missing iOS symbol completion pointer at ${pointerPath}`);
    }
    const pointer = JSON.parse(readFileSync(pointerPath, 'utf8')) as { directory?: string };
    if (!pointer.directory || !/^[A-Za-z0-9-]+$/.test(pointer.directory)) {
      throw new Error(`Invalid iOS symbol completion pointer directory in ${pointerPath}`);
    }
    const manifestPath = join(resolvedSymbols, pointer.directory, 'manifest.json');
    if (existsSync(manifestPath)) {
      const symbolManifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        ipa?: { sha256?: string };
      };
      if (
        typeof symbolManifest.ipa?.sha256 === 'string' &&
        symbolManifest.ipa.sha256.toLowerCase() !== liveEvidence.sha256
      ) {
        throw new Error(
          `iOS symbol manifest IPA SHA-256 (${symbolManifest.ipa.sha256}) does not match archived IPA (${liveEvidence.sha256}).`,
        );
      }
    }
  }

  return {
    ipaPath: resolvedIpa,
    sha256: liveEvidence.sha256,
    size: liveEvidence.size,
  };
}

export async function recoverPendingIosBuild({
  pendingDir,
  verifySymbols = verifyIosSymbolPackage,
  now = () => new Date(),
}: {
  pendingDir: string;
  verifySymbols?: typeof verifyIosSymbolPackage;
  now?: () => Date;
}) {
  const resolvedPendingDir = resolve(pendingDir);
  if (!existsSync(resolvedPendingDir) || !statSync(resolvedPendingDir).isDirectory()) {
    throw new Error(`Pending iOS build directory does not exist: ${resolvedPendingDir}`);
  }
  if (!basename(resolvedPendingDir).startsWith('pending-symbols-')) {
    throw new Error(`Expected pending-symbols-* directory, got ${basename(resolvedPendingDir)}.`);
  }
  const manifestPath = join(resolvedPendingDir, 'build-manifest.json');
  const checksumPath = join(resolvedPendingDir, 'SHA256SUMS');
  const symbolsDir = join(resolvedPendingDir, 'ios-symbols');
  if (!existsSync(manifestPath) || !existsSync(checksumPath) || !existsSync(symbolsDir)) {
    throw new Error(
      `Pending iOS build directory ${resolvedPendingDir} is missing build-manifest.json, SHA256SUMS, or ios-symbols.`,
    );
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    target?: string;
    commitSha?: string;
    localBuildId?: string;
    nativeBuildVersion?: string;
    artifact?: { filename?: string; sha256?: string };
    sentry?: Record<string, unknown>;
    githubRun?: { runId?: string; attempt?: string };
  };
  if (
    manifest.target !== 'ios-production' ||
    !manifest.localBuildId ||
    !manifest.nativeBuildVersion ||
    !manifest.commitSha ||
    !manifest.artifact?.filename ||
    !manifest.artifact?.sha256
  ) {
    throw new Error(`Invalid build-manifest.json in ${resolvedPendingDir}.`);
  }

  const pendingArtifactPath = join(resolvedPendingDir, manifest.artifact.filename);
  if (!existsSync(pendingArtifactPath) || !statSync(pendingArtifactPath).isFile()) {
    throw new Error(`Missing pending IPA at ${pendingArtifactPath}.`);
  }
  const liveEvidence = await fileEvidence(pendingArtifactPath);
  if (liveEvidence.sha256 !== manifest.artifact.sha256) {
    throw new Error(
      `Pending IPA SHA-256 mismatch: expected ${manifest.artifact.sha256}, got ${liveEvidence.sha256}.`,
    );
  }

  const symbolVerification = await verifySymbols({
    archivePath: symbolsDir,
    buildId: manifest.localBuildId,
    retryUpload: true,
  });

  // Promote ios-symbols from upload.pending (attempt-*) to package.complete (package-*) so submit-ios passes normal verification.
  const packageCompletePath = join(symbolsDir, 'package.complete');
  if (!existsSync(packageCompletePath)) {
    const pendingPointerPath = join(symbolsDir, 'upload.pending');
    if (!existsSync(pendingPointerPath)) {
      throw new Error(`Missing upload.pending and package.complete in ${symbolsDir}.`);
    }
    const pendingPointer = JSON.parse(readFileSync(pendingPointerPath, 'utf8')) as {
      directory?: string;
    };
    if (!pendingPointer.directory || !/^attempt-[A-Za-z0-9]+$/.test(pendingPointer.directory)) {
      throw new Error(`Invalid upload.pending directory pointer in ${pendingPointerPath}.`);
    }
    const attemptDir = join(symbolsDir, pendingPointer.directory);
    for (const requiredFile of [
      'dsyms.zip',
      'archive-info.plist',
      'manifest.json',
      'verification.json',
    ]) {
      if (!existsSync(join(attemptDir, requiredFile))) {
        throw new Error(`Missing ${requiredFile} in pending symbol attempt ${attemptDir}.`);
      }
    }

    const packageDirName = `package-${randomBytes(4).toString('hex')}`;
    const packageDir = join(symbolsDir, packageDirName);
    mkdirSync(packageDir, { recursive: true });
    for (const name of ['dsyms.zip', 'archive-info.plist', 'manifest.json']) {
      copyFileSync(join(attemptDir, name), join(packageDir, name));
    }

    const symbolManifestSha256 = (await fileEvidence(join(packageDir, 'manifest.json'))).sha256;
    const existingReceipt = JSON.parse(
      readFileSync(join(attemptDir, 'verification.json'), 'utf8'),
    ) as Record<string, unknown>;
    const repairedRecords = (symbolVerification as { repairedRecords?: unknown }).repairedRecords;
    const updatedReceipt = {
      ...existingReceipt,
      manifestSha256: symbolManifestSha256,
      preflight: { status: 'passed' },
      upload: { status: 'passed' },
      remoteVerification: { status: 'passed' },
      failure: null,
      records: Array.isArray(repairedRecords) ? repairedRecords : existingReceipt.records,
    };
    writeFileSync(
      join(packageDir, 'verification.json'),
      `${JSON.stringify(updatedReceipt, null, 2)}\n`,
    );
    writeFileSync(
      packageCompletePath,
      `${JSON.stringify({ directory: packageDirName }, null, 2)}\n`,
    );
    rmSync(pendingPointerPath, { force: true });
    rmSync(attemptDir, { recursive: true, force: true });
  }

  writeFileSync(
    join(resolvedPendingDir, 'ios-symbol-verification.json'),
    `${JSON.stringify(symbolVerification, null, 2)}\n`,
  );
  const updatedManifest = {
    ...manifest,
    sentry: {
      ...manifest.sentry,
      autoUpload: true,
      verified: true,
      symbolPackageComplete: true,
      pendingUpload: false,
    },
  };
  writeFileSync(manifestPath, `${JSON.stringify(updatedManifest, null, 2)}\n`);

  const channelDir = dirname(resolvedPendingDir);
  const finalDir = allocateFinalBuildDir(
    channelDir,
    manifest.nativeBuildVersion,
    manifest.commitSha.slice(0, 7),
    manifest.githubRun?.runId ?? 'recovery',
    manifest.githubRun?.attempt ?? '1',
  );
  renameSync(resolvedPendingDir, finalDir);
  writeFileSync(
    join(finalDir, '.complete'),
    `${JSON.stringify({ buildId: manifest.localBuildId, completedAt: now().toISOString() }, null, 2)}\n`,
  );
  updateLatestSymlink(channelDir, basename(finalDir));

  return {
    buildId: manifest.localBuildId,
    archiveDir: finalDir,
    artifactName: manifest.artifact.filename,
    artifactPath: join(finalDir, manifest.artifact.filename),
    symbolsDir: join(finalDir, 'ios-symbols'),
    nativeBuildVersion: manifest.nativeBuildVersion,
    sha256: liveEvidence.sha256,
    symbolVerification,
  };
}

export type BatchTargetOutcome =
  | {
      target: ReleaseTargetId;
      status: 'built' | 'reused';
      buildId: string;
      archiveDir: string;
      artifactName: string;
      artifactPath: string;
      symbolsDir: string;
      nativeBuildVersion: string;
      sha256: string;
    }
  | {
      target: ReleaseTargetId;
      status: 'failed';
      error: string;
    }
  | {
      target: ReleaseTargetId;
      status: 'skipped';
    };

export interface RunLocalReleaseBatchOptions {
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
  now?: () => Date;
  easCliPath?: string;
  localPluginPath?: string;
  keepStable?: number;
  keepPrerelease?: number;
  includeGooglePlay?: boolean;
  includeDomesticStores?: boolean;
  reuseExisting?: boolean;
  verifyGitHead?: boolean;
}

export async function runLocalReleaseBatch(options: RunLocalReleaseBatchOptions): Promise<{
  tag: string;
  commitSha: string;
  overallOk: boolean;
  targets: Record<ReleaseTargetId, BatchTargetOutcome>;
  pruned: string[];
}> {
  const parsedTag = parseReleaseTag(options.tag);
  if (!SHA_RE.test(options.commitSha)) {
    throw new Error(`Invalid commit SHA: ${options.commitSha}`);
  }
  const commitSha = options.commitSha.toLowerCase();
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const baseEnv = options.env ?? process.env;
  const run = options.run ?? defaultRunLocalCommand;
  const now = options.now ?? (() => new Date());

  const { version: appVersion } = readAppIdentifiers(projectDir);
  if (parsedTag.baseVersion !== appVersion) {
    throw new Error(
      `Release tag ${parsedTag.tag} base version (${parsedTag.baseVersion}) does not match app.json expo.version (${appVersion}).`,
    );
  }

  const releaseSecrets = assertReleaseEnv(baseEnv);
  const secretValues = [
    ...Object.values(releaseSecrets),
    baseEnv.GH_TOKEN ?? '',
    baseEnv.GITHUB_TOKEN ?? '',
    baseEnv.GITCODE_TOKEN ?? '',
  ].filter(Boolean);

  if (options.verifyGitHead !== false && existsSync(join(projectDir, '.git'))) {
    await verifyGitWorkspaceMatchesCommit({
      projectDir,
      expectedSha: commitSha,
      env: baseEnv,
      run,
      secrets: secretValues,
    });
  }

  const releaseRoot = resolveReleaseRoot(baseEnv, options.releaseRoot);
  const workdirsRoot = join(releaseRoot, '_workdirs');
  mkdirSync(workdirsRoot, { recursive: true, mode: 0o700 });
  chmodSync(workdirsRoot, 0o700);
  cleanupStaleWorkdirs(workdirsRoot, now().getTime());

  const includeGooglePlay = options.includeGooglePlay ?? !parsedTag.isPrerelease;
  const includeDomesticStores = options.includeDomesticStores ?? false;
  const androidTargets: ReleaseTargetId[] = [
    'android-public',
    ...(includeGooglePlay ? (['android-google-play'] as const) : []),
    ...(includeDomesticStores ? (['android-domestic-stores'] as const) : []),
  ];
  const iosTargets: ReleaseTargetId[] = ['ios-production'];
  const requestedTargets: ReleaseTargetId[] = [...androidTargets, ...iosTargets];

  const reused = new Map<
    ReleaseTargetId,
    Extract<Awaited<ReturnType<typeof findCompleteBuild>>, { found: true }>
  >();
  if (options.reuseExisting !== false) {
    for (const targetId of requestedTargets) {
      const existing = await findCompleteBuild({
        target: targetId,
        tag: parsedTag.tag,
        commitSha,
        releaseRoot,
      });
      if (existing.found) {
        reused.set(targetId, existing);
      }
    }
  }

  const androidNeedsBuild = androidTargets.some((id) => !reused.has(id));
  const iosNeedsBuild = iosTargets.some((id) => !reused.has(id));
  if (androidNeedsBuild || iosNeedsBuild) {
    const requiredGb =
      (androidNeedsBuild ? RELEASE_TARGETS['android-public'].minFreeDiskGb : 0) +
      (iosNeedsBuild ? RELEASE_TARGETS['ios-production'].minFreeDiskGb : 0);
    assertDiskSpace(releaseRoot, requiredGb, options.statfs);
  }

  const isolateGitRepo = androidNeedsBuild && iosNeedsBuild;

  const targets: Record<ReleaseTargetId, BatchTargetOutcome> = {
    'android-public': { target: 'android-public', status: 'skipped' },
    'android-google-play': { target: 'android-google-play', status: 'skipped' },
    'android-domestic-stores': { target: 'android-domestic-stores', status: 'skipped' },
    'ios-production': { target: 'ios-production', status: 'skipped' },
  };

  const executeTarget = async (targetId: ReleaseTargetId) => {
    const existing = reused.get(targetId);
    if (existing) {
      targets[targetId] = {
        target: targetId,
        status: 'reused',
        buildId: existing.buildId,
        archiveDir: existing.archiveDir,
        artifactName: existing.artifactName,
        artifactPath: existing.artifactPath,
        symbolsDir: existing.symbolsDir,
        nativeBuildVersion: existing.nativeBuildVersion,
        sha256: existing.sha256,
      };
      return;
    }

    try {
      const built = await runLocalReleaseBuild({
        target: targetId,
        tag: parsedTag.tag,
        commitSha,
        runId: options.runId,
        attempt: options.attempt,
        projectDir,
        releaseRoot,
        env: baseEnv,
        run,
        statfs: options.statfs,
        verifySymbols: options.verifySymbols,
        now,
        easCliPath: options.easCliPath,
        localPluginPath: options.localPluginPath,
        skipPrune: true,
        logPrefix: targetId,
        isolateGitRepo: isolateGitRepo && targetId === 'ios-production',
        verifyGitHead: false,
        skipStaleWorkdirCleanup: true,
      });
      targets[targetId] = {
        target: targetId,
        status: 'built',
        buildId: built.buildId,
        archiveDir: built.archiveDir,
        artifactName: built.artifactName,
        artifactPath: built.artifactPath,
        symbolsDir: built.symbolsDir,
        nativeBuildVersion: built.nativeBuildVersion,
        sha256: built.sha256,
      };
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      targets[targetId] = {
        target: targetId,
        status: 'failed',
        error: sanitizeSecrets(rawMessage, secretValues, baseEnv),
      };
    }
  };

  // Run Android targets sequentially so auto-incremented versionCodes never race, while iOS builds in parallel.
  const runAndroidLane = async () => {
    for (const targetId of androidTargets) {
      await executeTarget(targetId);
    }
  };
  const runIosLane = async () => {
    for (const targetId of iosTargets) {
      await executeTarget(targetId);
    }
  };

  await Promise.all([runAndroidLane(), runIosLane()]);

  const hasAnyReady = requestedTargets.some(
    (id) => targets[id].status === 'built' || targets[id].status === 'reused',
  );
  const pruneResult = hasAnyReady
    ? pruneReleases({
        releaseRoot,
        keepStable: options.keepStable ?? 5,
        keepPrerelease: options.keepPrerelease ?? 1,
        activeVersion: parsedTag.tag,
      })
    : { kept: [], removed: [] };

  const overallOk = requestedTargets.every(
    (id) => targets[id].status === 'built' || targets[id].status === 'reused',
  );

  return {
    tag: parsedTag.tag,
    commitSha,
    overallOk,
    targets,
    pruned: pruneResult.removed,
  };
}

const BATCH_OUTPUT_TARGETS: readonly ReleaseTargetId[] = [
  'android-public',
  'android-google-play',
  'ios-production',
];

function formatBatchOutputs(
  overallOk: boolean,
  targets: Record<ReleaseTargetId, BatchTargetOutcome>,
): Record<string, string> {
  const outputs: Record<string, string> = {
    overall_ok: overallOk ? 'true' : 'false',
  };
  for (const targetId of BATCH_OUTPUT_TARGETS) {
    const prefix = targetId.replace(/-/g, '_');
    const outcome = targets[targetId];
    const isReady = outcome.status === 'built' || outcome.status === 'reused';
    outputs[`${prefix}_ready`] = isReady ? 'true' : 'false';
    outputs[`${prefix}_status`] = outcome.status;
    outputs[`${prefix}_build_id`] = isReady ? outcome.buildId : '';
    outputs[`${prefix}_archive_dir`] = isReady ? outcome.archiveDir : '';
    outputs[`${prefix}_artifact_name`] = isReady ? outcome.artifactName : '';
    outputs[`${prefix}_artifact_path`] = isReady ? outcome.artifactPath : '';
    outputs[`${prefix}_native_build_version`] = isReady ? outcome.nativeBuildVersion : '';
    outputs[`${prefix}_sha256`] = isReady ? outcome.sha256 : '';
    if (targetId === 'ios-production') {
      outputs[`${prefix}_symbols_dir`] = isReady ? outcome.symbolsDir : '';
    }
  }
  return outputs;
}

function formatBatchSummary(
  tag: string,
  targets: Record<ReleaseTargetId, BatchTargetOutcome>,
): string {
  const lines: string[] = [
    `### Native Build Summary (${tag})`,
    '',
    '| Target | Status | Native Build | SHA-256 | Archive |',
    '| --- | --- | --- | --- | --- |',
  ];
  const failures: string[] = [];

  for (const targetId of BATCH_OUTPUT_TARGETS) {
    const outcome = targets[targetId];
    if (outcome.status === 'built' || outcome.status === 'reused') {
      lines.push(
        `| \`${targetId}\` | ${outcome.status} | \`${outcome.nativeBuildVersion}\` | \`${outcome.sha256}\` | \`${outcome.archiveDir}\` |`,
      );
    } else if (outcome.status === 'failed') {
      lines.push(`| \`${targetId}\` | failed | — | — | — |`);
      failures.push(`- \`${targetId}\`: ${outcome.error}`);
    } else {
      lines.push(`| \`${targetId}\` | skipped | — | — | — |`);
    }
  }

  const playOutcome = targets['android-google-play'];
  if (playOutcome.status === 'built' || playOutcome.status === 'reused') {
    lines.push(
      '',
      '### Google Play AAB',
      '',
      `\`submit-google-play\` uploads the archived AAB to Google Play as a production draft. Signed AAB and \`SHA256SUMS\` remain archived at: \`${playOutcome.archiveDir}\``,
      'On the maintainer workstation, use the matching version code in Play Console to complete the draft and send it for review.',
    );
  }

  if (failures.length > 0) {
    lines.push('', '### Build Failures', '', ...failures);
  }

  return `${lines.join('\n')}\n`;
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

  if (command === 'build-all') {
    const { values } = parseArgs({
      args: rest,
      options: {
        tag: { type: 'string' },
        commit: { type: 'string' },
        'run-id': { type: 'string' },
        attempt: { type: 'string' },
        root: { type: 'string' },
        'google-play': { type: 'string', default: 'auto' },
        'no-reuse': { type: 'boolean', default: false },
        'allow-partial-failure': { type: 'boolean', default: false },
        'github-output': { type: 'string' },
        summary: { type: 'string' },
      },
      strict: true,
    });
    if (!values.tag || !values.commit) {
      throw new Error('Missing required flags: --tag, --commit.');
    }
    const googlePlayMode = values['google-play'] ?? 'auto';
    if (googlePlayMode !== 'auto' && googlePlayMode !== 'true' && googlePlayMode !== 'false') {
      throw new Error(`Invalid --google-play value: ${googlePlayMode}. Expected auto|true|false.`);
    }
    const result = await runLocalReleaseBatch({
      tag: values.tag,
      commitSha: values.commit,
      runId: values['run-id'] ?? 'manual',
      attempt: values.attempt ?? '1',
      releaseRoot: values.root,
      includeGooglePlay: googlePlayMode === 'auto' ? undefined : googlePlayMode === 'true',
      reuseExisting: !values['no-reuse'],
    });
    if (values['github-output']) {
      writeGitHubOutputs(
        values['github-output'],
        formatBatchOutputs(result.overallOk, result.targets),
      );
    }
    if (values.summary) {
      appendFileSync(values.summary, formatBatchSummary(result.tag, result.targets));
    }
    console.log(JSON.stringify(result, null, 2));
    if (!result.overallOk && !values['allow-partial-failure']) {
      process.exitCode = 1;
    }
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
              artifact_name: result.artifactName,
              artifact_path: result.artifactPath,
              symbols_dir: result.symbolsDir,
              native_build_version: result.nativeBuildVersion,
              sha256: result.sha256,
            }
          : { found: 'false' },
      );
    }
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'check-submit') {
    const { values } = parseArgs({
      args: rest,
      options: {
        'build-dir': { type: 'string' },
        'build-id': { type: 'string' },
        'github-output': { type: 'string' },
      },
      strict: true,
    });
    if (!values['build-dir']) {
      throw new Error('Usage: check-submit --build-dir <dir> [--build-id <id>]');
    }
    const receipt = readSubmitReceipt(resolve(values['build-dir']));
    const alreadySubmitted =
      receipt?.status === 'succeeded' &&
      (!values['build-id'] || receipt.buildId === values['build-id']);
    if (values['github-output']) {
      writeGitHubOutputs(values['github-output'], {
        already_submitted: alreadySubmitted ? 'true' : 'false',
      });
    }
    console.log(JSON.stringify({ alreadySubmitted, receipt }, null, 2));
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

  if (command === 'verify-ipa') {
    const { values } = parseArgs({
      args: rest,
      options: {
        'ipa-path': { type: 'string' },
        'expected-sha256': { type: 'string' },
        'symbols-dir': { type: 'string' },
      },
      strict: true,
    });
    if (!values['ipa-path'] || !values['expected-sha256']) {
      throw new Error(
        'Usage: verify-ipa --ipa-path <path> --expected-sha256 <sha256> [--symbols-dir <dir>]',
      );
    }
    const verified = await verifyArchivedIpa({
      ipaPath: values['ipa-path'],
      expectedSha256: values['expected-sha256'],
      symbolsDir: values['symbols-dir'],
    });
    console.log(JSON.stringify(verified, null, 2));
    return;
  }

  if (command === 'recover-ios') {
    const { values } = parseArgs({
      args: rest,
      options: {
        'pending-dir': { type: 'string' },
      },
      strict: true,
    });
    if (!values['pending-dir']) {
      throw new Error('Usage: recover-ios --pending-dir <dir>');
    }
    const recovered = await recoverPendingIosBuild({
      pendingDir: values['pending-dir'],
    });
    console.log(JSON.stringify(recovered, null, 2));
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
    'Usage: releaseLocalBuild.ts <build|build-all|find-complete|check-submit|record-submit|verify-ipa|recover-ios|prune> [options]',
  );
}

if (basename(process.argv[1] ?? '') === 'releaseLocalBuild.ts') {
  void main().catch((error) => {
    console.error(sanitizeDiagnostic(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
}
