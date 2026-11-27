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
  rmSync,
  statfsSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { parseArgs } from 'node:util';

export type PrBuildTargetId = 'android-dev' | 'ios-dev' | 'android-production';

export interface PrBuildTargetConfig {
  id: PrBuildTargetId;
  platform: 'android' | 'ios';
  profile: 'development' | 'production';
  ext: 'apk' | 'ipa';
  minFreeDiskGb: number;
  appIdSuffix: '' | '.dev';
  expectInstallPermission: boolean | null;
  disableSentryUpload: boolean;
}

export const PR_BUILD_TARGETS: Record<PrBuildTargetId, PrBuildTargetConfig> = {
  'android-dev': {
    id: 'android-dev',
    platform: 'android',
    profile: 'development',
    ext: 'apk',
    minFreeDiskGb: 30,
    appIdSuffix: '.dev',
    expectInstallPermission: false,
    disableSentryUpload: false,
  },
  'ios-dev': {
    id: 'ios-dev',
    platform: 'ios',
    profile: 'development',
    ext: 'ipa',
    minFreeDiskGb: 50,
    appIdSuffix: '.dev',
    expectInstallPermission: null,
    disableSentryUpload: false,
  },
  'android-production': {
    id: 'android-production',
    platform: 'android',
    profile: 'production',
    ext: 'apk',
    minFreeDiskGb: 30,
    appIdSuffix: '',
    expectInstallPermission: true,
    disableSentryUpload: true,
  },
};

export const PR_BUILD_TARGET_ORDER: readonly PrBuildTargetId[] = [
  'android-dev',
  'android-production',
  'ios-dev',
];

export const REPO_PR_BUILD_NAMESPACE = 'cherry-studio-app-pr';

export const REQUIRED_PR_BUILD_ENV_VARS = ['EXPO_TOKEN'] as const;

export const DEFAULT_ANDROID_GRADLE_OPTS =
  '-Dorg.gradle.parallel=true -Dorg.gradle.daemon=false -Dorg.gradle.workers.max=12';
export const DEFAULT_PNPM_VIRTUAL_STORE_MAX_LENGTH = '40';

const INSTALL_PERMISSION = 'android.permission.REQUEST_INSTALL_PACKAGES';
const SHA_RE = /^[a-f0-9]{40}$/i;
const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_SOURCE_LABEL_RE = /^[a-z0-9][a-z0-9._-]{0,47}$/;
// eslint-disable-next-line no-control-regex
const UNSAFE_PATH_CHARS_RE = /[\u0000-\u001f\u007f]/;
const MAX_CAPTURE_BYTES = 64 * 1024 * 1024;
const MAX_STREAM_TAIL_CHARS = 256 * 1024;
const STALE_UNTRACKED_WORKDIR_AGE_MS = 5 * 60_000;

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
    logPrefix?: string;
    secrets?: Iterable<string>;
  },
) => Promise<LocalCommandResult>;

/**
 * Validate an identifier token that becomes part of a filename or directory name.
 */
export function requireSafeId(value: string, label: string): string {
  if (!SAFE_ID_RE.test(value) || value.includes('..')) {
    throw new Error(`Invalid ${label}: expected 1-128 characters from A-Z a-z 0-9 . _ -`);
  }
  return value;
}

/**
 * Validate a command-line path and normalize it as an absolute path without control chars.
 */
export function requireCliPath(value: string, label: string): string {
  if (value.trim() === '' || UNSAFE_PATH_CHARS_RE.test(value)) {
    throw new Error(`Invalid ${label}: expected a non-empty path without control characters.`);
  }
  return resolve(value);
}

function optionalCliPath(value: string | undefined, label: string): string | undefined {
  return value === undefined ? undefined : requireCliPath(value, label);
}

/**
 * Parse and deduplicate a comma-separated list of PR build targets in canonical lane order.
 */
export function parsePrBuildTargets(raw: string): PrBuildTargetId[] {
  const tokens = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    throw new Error(
      `Missing PR build targets. Expected one or more of ${PR_BUILD_TARGET_ORDER.join(', ')}.`,
    );
  }
  const selected = new Set<PrBuildTargetId>();
  for (const token of tokens) {
    if (!(token in PR_BUILD_TARGETS)) {
      throw new Error(
        `Unknown PR build target: ${token}. Expected one of ${PR_BUILD_TARGET_ORDER.join(', ')}.`,
      );
    }
    selected.add(token as PrBuildTargetId);
  }
  return PR_BUILD_TARGET_ORDER.filter((targetId) => selected.has(targetId));
}

/**
 * Convert a PR or branch descriptor into a safe lowercase filename/artifact label.
 */
export function sanitizeSourceLabel(label: string): string {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 48)
    .replace(/^[._-]+|[._-]+$/g, '');
  if (!normalized || !SAFE_SOURCE_LABEL_RE.test(normalized) || normalized.includes('..')) {
    throw new Error(`Invalid source label: ${label}`);
  }
  return normalized;
}

export function redactSecretsInStream(
  text: string,
  secrets: Iterable<string> = [],
  env: Record<string, string | undefined> = process.env,
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
  // Mask longest values first so full URLs/DSNs redact before component substrings.
  for (const value of [...candidates].sort((a, b) => b.length - a.length)) {
    redacted = redacted.split(value).join('[redacted]');
  }
  return redacted
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/Basic\s+\S+/gi, 'Basic [redacted]')
    .replace(/\b(key|token|sig|signature|X-Amz-[a-z0-9-]+)=([^\s&#"']*)/gi, '$1=[redacted]')
    .replace(/(?:sntrys_|sntryu_|gh[pousr]_|npm_)[a-zA-Z0-9_]+/g, '[redacted]');
}

export function sanitizeSecrets(
  text: string,
  secrets: Iterable<string> = [],
  env: Record<string, string | undefined> = process.env,
): string {
  return redactSecretsInStream(text, secrets, env);
}

export function assertNoSecretLeak(text: string, secrets: Iterable<string>) {
  for (const secret of secrets) {
    if (secret && secret.length >= 4 && text.includes(secret)) {
      throw new Error('Refusing to persist manifest containing secret material.');
    }
  }
}

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
    const stdio: StdioOptions = streamOutput
      ? ['ignore', 'pipe', 'pipe']
      : [options?.input !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'];

    const child = spawn(command, args, {
      // NOSONAR fixed internal tools/commands with validated arguments and no shell expansion.
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

export function resolveReleaseRoot(
  env: Record<string, string | undefined> = process.env,
  explicitRoot?: string,
): string {
  const raw =
    explicitRoot?.trim() || env.RUNNER_RELEASE_ROOT?.trim() || env.CHERRY_RELEASE_ROOT?.trim();
  return resolve(raw || join(homedir(), 'releases'));
}

export function assertPrBuildEnv(
  env: Record<string, string | undefined> = process.env,
): Record<(typeof REQUIRED_PR_BUILD_ENV_VARS)[number], string> {
  const missing: string[] = [];
  const resolved = {} as Record<(typeof REQUIRED_PR_BUILD_ENV_VARS)[number], string>;
  for (const key of REQUIRED_PR_BUILD_ENV_VARS) {
    const value = env[key]?.trim();
    if (!value) {
      missing.push(key);
    } else {
      resolved[key] = value;
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing required PR build environment variables: ${missing.join(', ')}`);
  }
  return resolved;
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

export function resolveAndroidBuildToolsDir(
  env: Record<string, string | undefined>,
): string | undefined {
  const candidates = [
    env.ANDROID_HOME?.trim(),
    env.ANDROID_SDK_ROOT?.trim(),
    join(homedir(), 'Library', 'Android', 'sdk'),
  ].filter((value): value is string => Boolean(value));

  for (const sdkRoot of candidates) {
    const buildToolsRoot = join(sdkRoot, 'build-tools');
    if (!existsSync(buildToolsRoot)) continue;
    const versions = readdirSync(buildToolsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const latest = versions.at(-1);
    if (latest) {
      return join(buildToolsRoot, latest);
    }
  }
  return undefined;
}

function resolveAndroidTool(buildToolsDir: string | undefined, toolName: string): string {
  if (buildToolsDir) {
    const fullPath = join(buildToolsDir, toolName);
    if (existsSync(fullPath)) return fullPath;
  }
  return toolName;
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

export interface InspectedPrArtifact {
  nativeBuildVersion: string;
  signingCertificateSha256: string | null;
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
}): Promise<InspectedPrArtifact> {
  await runChecked(run, 'unzip', ['-tq', artifactPath], { env, secrets });
  const zipList = await runChecked(run, 'unzip', ['-Z1', artifactPath], { env, secrets });
  const entries = zipList.stdout.split(/\r?\n/).map((line) => line.trim());
  if (!entries.includes('AndroidManifest.xml')) {
    throw new Error(`APK is missing AndroidManifest.xml: ${artifactPath}`);
  }

  const buildToolsDir = resolveAndroidBuildToolsDir(env);
  const apksigner = resolveAndroidTool(buildToolsDir, 'apksigner');
  const certs = await runChecked(run, apksigner, ['verify', '--print-certs', artifactPath], {
    env,
    secrets,
  });
  const certMatch = /Signer #1 certificate SHA-256 digest:\s*([a-f0-9]+)/i.exec(certs.stdout);
  if (!certMatch?.[1]) {
    throw new Error('Could not read APK Signer #1 SHA-256 certificate digest.');
  }

  let badging: LocalCommandResult;
  const aapt2 = resolveAndroidTool(buildToolsDir, 'aapt2');
  const aapt = resolveAndroidTool(buildToolsDir, 'aapt');
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
    throw new Error('Could not extract numeric versionCode from APK badging output.');
  }

  const hasInstallPermission = new RegExp(
    `uses-permission:\\s*name='${escapeRegex(INSTALL_PERMISSION)}'`,
  ).test(badging.stdout);
  if (hasInstallPermission !== expectInstallPermission) {
    throw new Error(
      expectInstallPermission
        ? `Production APK must declare ${INSTALL_PERMISSION}.`
        : `Development APK must not declare ${INSTALL_PERMISSION}.`,
    );
  }

  return {
    nativeBuildVersion: versionCodeMatch[1],
    signingCertificateSha256: certMatch[1].toLowerCase(),
  };
}

async function inspectIpa({
  artifactPath,
  stagingDir,
  expectedBundleId,
  env,
  run,
  secrets,
}: {
  artifactPath: string;
  stagingDir: string;
  expectedBundleId: string;
  env: NodeJS.ProcessEnv;
  run: RunLocalCommand;
  secrets: string[];
}): Promise<InspectedPrArtifact> {
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
      { env, secrets },
    );
    const extractedPlistPath = join(plistScratch, 'Info.plist');
    if (!existsSync(extractedPlistPath)) {
      throw new Error(`Failed to extract Info.plist from IPA: ${artifactPath}`);
    }
    const plistJson = await runChecked(
      run,
      'plutil',
      ['-convert', 'json', '-o', '-', extractedPlistPath],
      { env, secrets },
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

  return {
    nativeBuildVersion: buildNumber,
    signingCertificateSha256: null,
  };
}

function selectBuiltArtifact(artifactsDir: string, ext: 'apk' | 'ipa'): string {
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

export function cleanupStalePrWorkdirs(workdirsRoot: string, nowMs = Date.now()): string[] {
  if (!existsSync(workdirsRoot)) return [];
  const removed: string[] = [];
  for (const entry of readdirSync(workdirsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(`${REPO_PR_BUILD_NAMESPACE}-`)) {
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
      `Refusing PR build: git HEAD (${actualSha || 'unknown'}) does not match --commit (${expectedSha}).`,
    );
  }
  const statusResult = await runChecked(
    run,
    'git',
    ['status', '--porcelain', '--untracked-files=normal'],
    { cwd: projectDir, env, secrets },
  );
  if (statusResult.stdout.trim().length > 0) {
    throw new Error(
      `Refusing PR build from dirty git working tree in ${projectDir}. Clean changes first.`,
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

export interface RunPrBuildTargetOptions {
  target: PrBuildTargetId;
  sourceLabel: string;
  commitSha: string;
  runId: string;
  attempt: string;
  outputDir: string;
  projectDir?: string;
  releaseRoot?: string;
  env?: NodeJS.ProcessEnv;
  run?: RunLocalCommand;
  statfs?: (path: string) => { bavail: number | bigint; bsize: number | bigint };
  localBuildId?: string;
  now?: () => Date;
  easCliPath?: string;
  localPluginPath?: string;
  logPrefix?: string;
  isolateGitRepo?: boolean;
  verifyGitHead?: boolean;
  skipStaleWorkdirCleanup?: boolean;
}

export async function runPrBuildTarget(options: RunPrBuildTargetOptions) {
  const target = PR_BUILD_TARGETS[options.target];
  if (!target) {
    throw new Error(`Unknown PR build target: ${String(options.target)}`);
  }
  const sourceLabel = sanitizeSourceLabel(options.sourceLabel);
  if (!SHA_RE.test(options.commitSha)) {
    throw new Error(`Invalid commit SHA: ${options.commitSha}`);
  }
  const commitSha = options.commitSha.toLowerCase();
  const runId = requireSafeId(options.runId, '--run-id');
  const attempt = requireSafeId(options.attempt, '--attempt');
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const outputRoot = resolve(options.outputDir);
  const baseEnv = options.env ?? process.env;
  const run = options.run ?? defaultRunLocalCommand;
  const now = options.now ?? (() => new Date());
  const localBuildId = (options.localBuildId ?? randomUUID()).toLowerCase();

  const { version: appVersion, androidPackage, iosBundleId } = readAppIdentifiers(projectDir);
  const prSecrets = assertPrBuildEnv(baseEnv);
  const secretValues = [
    ...Object.values(prSecrets),
    baseEnv.GH_TOKEN ?? '',
    baseEnv.GITHUB_TOKEN ?? '',
    baseEnv.SENTRY_AUTH_TOKEN ?? '',
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
  assertDiskSpace(releaseRoot, target.minFreeDiskGb, options.statfs);

  const workdirsRoot = join(releaseRoot, '_pr-workdirs');
  mkdirSync(workdirsRoot, { recursive: true, mode: 0o700 });
  chmodSync(workdirsRoot, 0o700);
  if (!options.skipStaleWorkdirCleanup) {
    cleanupStalePrWorkdirs(workdirsRoot, now().getTime());
  }

  const jobSlug = `${REPO_PR_BUILD_NAMESPACE}-${runId}-${target.id}-attempt${attempt}-${randomBytes(4).toString('hex')}`;
  const jobDir = join(workdirsRoot, jobSlug);
  mkdirSync(jobDir, { recursive: true, mode: 0o700 });
  chmodSync(jobDir, 0o700);
  writeFileSync(join(jobDir, '.owner.pid'), `${process.pid}\n`, { mode: 0o600 });

  const workdir = join(jobDir, 'work');
  const artifactsDir = join(jobDir, 'artifacts');
  const stagingDir = join(jobDir, 'staged');
  mkdirSync(artifactsDir, { recursive: true, mode: 0o700 });
  mkdirSync(stagingDir, { recursive: true, mode: 0o700 });

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
      ...prSecrets,
      PNPM_CONFIG_VIRTUAL_STORE_DIR_MAX_LENGTH:
        baseEnv.PNPM_CONFIG_VIRTUAL_STORE_DIR_MAX_LENGTH ?? DEFAULT_PNPM_VIRTUAL_STORE_MAX_LENGTH,
      ...(target.platform === 'android'
        ? { GRADLE_OPTS: baseEnv.GRADLE_OPTS ?? DEFAULT_ANDROID_GRADLE_OPTS }
        : {}),
      EAS_LOCAL_BUILD_PLUGIN_PATH:
        baseEnv.EAS_LOCAL_BUILD_PLUGIN_PATH ?? resolvedBins.localPluginPath,
      EAS_LOCAL_BUILD_WORKINGDIR: workdir,
      EAS_LOCAL_BUILD_ARTIFACTS_DIR: artifactsDir,
      ...(target.disableSentryUpload
        ? {
            SENTRY_DISABLE_AUTO_UPLOAD: 'true',
            SENTRY_DISABLE_NATIVE_DEBUG_UPLOAD: 'true',
            SENTRY_ALLOW_FAILURE: 'true',
          }
        : {}),
    };
    delete buildEnv.EAS_LOCAL_BUILD_ARTIFACT_PATH;
    delete buildEnv.EAS_LOCAL_BUILD_SKIP_CLEANUP;
    delete buildEnv.CHERRY_LOCAL_RELEASE_SYMBOL_GATE;
    delete buildEnv.CHERRY_LOCAL_BUILD_ID;
    delete buildEnv.CHERRY_SOURCE_SHA;

    const proxyShimPath = join(__dirname, 'easProxyShim.cjs');
    const useProxyShim =
      Boolean(buildEnv.https_proxy?.trim() || buildEnv.HTTPS_PROXY?.trim()) &&
      existsSync(proxyShimPath);

    const buildResult = await run(
      process.execPath,
      [
        ...(useProxyShim ? ['--require', proxyShimPath] : []),
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
    const shortSha = commitSha.slice(0, 7);
    const artifactName = `cherry-studio-${sourceLabel}-${shortSha}-${target.id}.${target.ext}`;
    const stagedArtifactPath = join(stagingDir, artifactName);
    copyFileSync(builtArtifactPath, stagedArtifactPath);

    const expectedIdentifier =
      target.platform === 'ios'
        ? `${iosBundleId}${target.appIdSuffix}`
        : `${androidPackage}${target.appIdSuffix}`;

    const inspected =
      target.ext === 'apk'
        ? await inspectApk({
            artifactPath: stagedArtifactPath,
            expectedPackage: expectedIdentifier,
            expectInstallPermission: target.expectInstallPermission === true,
            env: buildEnv,
            run,
            secrets: secretValues,
          })
        : await inspectIpa({
            artifactPath: stagedArtifactPath,
            stagingDir,
            expectedBundleId: expectedIdentifier,
            env: buildEnv,
            run,
            secrets: secretValues,
          });

    const evidence = await fileEvidence(stagedArtifactPath);
    writeFileSync(join(stagingDir, 'SHA256SUMS'), `${evidence.sha256}  ${artifactName}\n`);

    const manifest = {
      schemaVersion: 1,
      sourceLabel,
      commitSha,
      target: target.id,
      platform: target.platform,
      profile: target.profile,
      bundleOrPackageId: expectedIdentifier,
      appVersion,
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
      sentryUploadDisabled: target.disableSentryUpload,
      githubRun: {
        runId,
        attempt,
      },
      builtAt: now().toISOString(),
    };
    const serializedManifest = `${JSON.stringify(manifest, null, 2)}\n`;
    assertNoSecretLeak(serializedManifest, secretValues);
    writeFileSync(join(stagingDir, 'build-manifest.json'), serializedManifest);

    const targetDir = join(outputRoot, target.id);
    rmSync(targetDir, { recursive: true, force: true });
    mkdirSync(targetDir, { recursive: true });
    for (const file of [artifactName, 'SHA256SUMS', 'build-manifest.json']) {
      cpSync(join(stagingDir, file), join(targetDir, file));
    }

    return {
      target: target.id,
      buildId: localBuildId,
      dir: targetDir,
      artifactName,
      artifactPath: join(targetDir, artifactName),
      nativeBuildVersion: inspected.nativeBuildVersion,
      sha256: evidence.sha256,
    };
  } finally {
    rmSync(jobDir, { recursive: true, force: true });
  }
}

export type PrBatchTargetOutcome =
  | {
      target: PrBuildTargetId;
      status: 'built';
      buildId: string;
      dir: string;
      artifactName: string;
      artifactPath: string;
      nativeBuildVersion: string;
      sha256: string;
    }
  | {
      target: PrBuildTargetId;
      status: 'failed';
      error: string;
    }
  | {
      target: PrBuildTargetId;
      status: 'skipped';
    };

export interface RunPrBuildBatchOptions {
  targets: PrBuildTargetId[] | string;
  sourceLabel: string;
  commitSha: string;
  runId: string;
  attempt: string;
  outputDir: string;
  projectDir?: string;
  releaseRoot?: string;
  env?: NodeJS.ProcessEnv;
  run?: RunLocalCommand;
  statfs?: (path: string) => { bavail: number | bigint; bsize: number | bigint };
  now?: () => Date;
  easCliPath?: string;
  localPluginPath?: string;
  verifyGitHead?: boolean;
}

export async function runPrBuildBatch(options: RunPrBuildBatchOptions): Promise<{
  sourceLabel: string;
  commitSha: string;
  overallOk: boolean;
  targets: Record<PrBuildTargetId, PrBatchTargetOutcome>;
}> {
  const selectedTargets = Array.isArray(options.targets)
    ? parsePrBuildTargets(options.targets.join(','))
    : parsePrBuildTargets(options.targets);
  const sourceLabel = sanitizeSourceLabel(options.sourceLabel);
  if (!SHA_RE.test(options.commitSha)) {
    throw new Error(`Invalid commit SHA: ${options.commitSha}`);
  }
  const commitSha = options.commitSha.toLowerCase();
  const runId = requireSafeId(options.runId, '--run-id');
  const attempt = requireSafeId(options.attempt, '--attempt');
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const outputDir = resolve(options.outputDir);
  const baseEnv = options.env ?? process.env;
  const run = options.run ?? defaultRunLocalCommand;
  const now = options.now ?? (() => new Date());

  readAppIdentifiers(projectDir);
  const prSecrets = assertPrBuildEnv(baseEnv);
  const secretValues = [
    ...Object.values(prSecrets),
    baseEnv.GH_TOKEN ?? '',
    baseEnv.GITHUB_TOKEN ?? '',
    baseEnv.SENTRY_AUTH_TOKEN ?? '',
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
  const workdirsRoot = join(releaseRoot, '_pr-workdirs');
  mkdirSync(workdirsRoot, { recursive: true, mode: 0o700 });
  chmodSync(workdirsRoot, 0o700);
  cleanupStalePrWorkdirs(workdirsRoot, now().getTime());

  const androidTargets = selectedTargets.filter(
    (id) => PR_BUILD_TARGETS[id].platform === 'android',
  );
  const iosTargets = selectedTargets.filter((id) => PR_BUILD_TARGETS[id].platform === 'ios');

  const requiredGb =
    (androidTargets.length > 0 ? PR_BUILD_TARGETS['android-dev'].minFreeDiskGb : 0) +
    (iosTargets.length > 0 ? PR_BUILD_TARGETS['ios-dev'].minFreeDiskGb : 0);
  assertDiskSpace(releaseRoot, requiredGb, options.statfs);

  const isolateGitRepo = androidTargets.length > 0 && iosTargets.length > 0;

  const targets: Record<PrBuildTargetId, PrBatchTargetOutcome> = {
    'android-dev': { target: 'android-dev', status: 'skipped' },
    'ios-dev': { target: 'ios-dev', status: 'skipped' },
    'android-production': { target: 'android-production', status: 'skipped' },
  };

  const executeTarget = async (targetId: PrBuildTargetId) => {
    try {
      const built = await runPrBuildTarget({
        target: targetId,
        sourceLabel,
        commitSha,
        runId,
        attempt,
        outputDir,
        projectDir,
        releaseRoot,
        env: baseEnv,
        run,
        statfs: options.statfs,
        now,
        easCliPath: options.easCliPath,
        localPluginPath: options.localPluginPath,
        logPrefix: targetId,
        isolateGitRepo: isolateGitRepo && targetId === 'ios-dev',
        verifyGitHead: false,
        skipStaleWorkdirCleanup: true,
      });
      targets[targetId] = {
        target: targetId,
        status: 'built',
        buildId: built.buildId,
        dir: built.dir,
        artifactName: built.artifactName,
        artifactPath: built.artifactPath,
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

  // Run Android builds sequentially in projectDir while iOS builds in an isolated clone.
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

  const overallOk = selectedTargets.every((id) => targets[id].status === 'built');

  return {
    sourceLabel,
    commitSha,
    overallOk,
    targets,
  };
}

function summarizeErrorOneLine(error: string): string {
  const collapsed = error.replace(/\s+/g, ' ').trim();
  return collapsed.length > 300 ? `${collapsed.slice(0, 297)}...` : collapsed;
}

export function formatPrBatchOutputs(
  overallOk: boolean,
  targets: Record<PrBuildTargetId, PrBatchTargetOutcome>,
): Record<string, string> {
  const outputs: Record<string, string> = {
    overall_ok: overallOk ? 'true' : 'false',
  };
  for (const targetId of PR_BUILD_TARGET_ORDER) {
    const prefix = targetId.replace(/-/g, '_');
    const outcome = targets[targetId];
    const isReady = outcome.status === 'built';
    outputs[`${prefix}_ready`] = isReady ? 'true' : 'false';
    outputs[`${prefix}_status`] = outcome.status;
    outputs[`${prefix}_dir`] = isReady ? outcome.dir : '';
    outputs[`${prefix}_artifact_name`] = isReady ? outcome.artifactName : '';
    outputs[`${prefix}_artifact_path`] = isReady ? outcome.artifactPath : '';
    outputs[`${prefix}_native_build_version`] = isReady ? outcome.nativeBuildVersion : '';
    outputs[`${prefix}_sha256`] = isReady ? outcome.sha256 : '';
    outputs[`${prefix}_error`] =
      outcome.status === 'failed' ? summarizeErrorOneLine(outcome.error) : '';
  }
  return outputs;
}

export function formatPrBatchSummary(
  sourceLabel: string,
  commitSha: string,
  targets: Record<PrBuildTargetId, PrBatchTargetOutcome>,
): string {
  const lines: string[] = [
    `### PR Native Build Summary (${sourceLabel} @ \`${commitSha.slice(0, 7)}\`)`,
    '',
    '| Target | Status | Native Build | SHA-256 | Artifact |',
    '| --- | --- | --- | --- | --- |',
  ];
  const failures: string[] = [];

  for (const targetId of PR_BUILD_TARGET_ORDER) {
    const outcome = targets[targetId];
    if (outcome.status === 'built') {
      lines.push(
        `| \`${targetId}\` | built | \`${outcome.nativeBuildVersion}\` | \`${outcome.sha256}\` | \`${outcome.artifactName}\` |`,
      );
    } else if (outcome.status === 'failed') {
      lines.push(`| \`${targetId}\` | failed | — | — | — |`);
      failures.push(`- \`${targetId}\`: ${outcome.error}`);
    } else {
      lines.push(`| \`${targetId}\` | skipped | — | — | — |`);
    }
  }

  if (failures.length > 0) {
    lines.push('', '### Build Failures', '', ...failures);
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command !== 'build-all') {
    throw new Error(
      'Usage: prLocalBuild.ts build-all --targets <csv> --source-label <label> --commit <sha> --output-dir <dir> [options]',
    );
  }

  const { values } = parseArgs({
    args: rest,
    options: {
      targets: { type: 'string' },
      'source-label': { type: 'string' },
      commit: { type: 'string' },
      'run-id': { type: 'string' },
      attempt: { type: 'string' },
      'project-dir': { type: 'string' },
      'output-dir': { type: 'string' },
      root: { type: 'string' },
      'allow-partial-failure': { type: 'boolean', default: false },
      'github-output': { type: 'string' },
      summary: { type: 'string' },
    },
    strict: true,
  });

  if (!values.targets || !values['source-label'] || !values.commit || !values['output-dir']) {
    throw new Error('Missing required flags: --targets, --source-label, --commit, --output-dir.');
  }

  const result = await runPrBuildBatch({
    targets: values.targets,
    sourceLabel: values['source-label'],
    commitSha: values.commit,
    runId: requireSafeId(values['run-id'] ?? 'manual', '--run-id'),
    attempt: requireSafeId(values.attempt ?? '1', '--attempt'),
    projectDir: optionalCliPath(values['project-dir'], '--project-dir'),
    outputDir: requireCliPath(values['output-dir'], '--output-dir'),
    releaseRoot: optionalCliPath(values.root, '--root'),
  });

  if (values['github-output']) {
    writeGitHubOutputs(
      requireCliPath(values['github-output'], '--github-output'),
      formatPrBatchOutputs(result.overallOk, result.targets),
    );
  }
  if (values.summary) {
    appendFileSync(
      requireCliPath(values.summary, '--summary'),
      formatPrBatchSummary(result.sourceLabel, result.commitSha, result.targets),
    );
  }

  console.log(sanitizeSecrets(JSON.stringify(result, null, 2)));
  if (!result.overallOk && !values['allow-partial-failure']) {
    process.exitCode = 1;
  }
}

if (basename(process.argv[1] ?? '') === 'prLocalBuild.ts') {
  void main().catch((error) => {
    console.error(sanitizeSecrets(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
}
