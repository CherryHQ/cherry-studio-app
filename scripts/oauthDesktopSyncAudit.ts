import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(__dirname, '..');
const MAP_PATH = path.join(REPO_ROOT, 'src/backend/services/oauth/desktop-sync-map.json');
const OAUTH_ROOT = 'src/backend/services/oauth';
const DESKTOP_SOURCE_PATHS = [
  'src/main/services/oauth',
  'src/main/services/CopilotService.ts',
  'src/renderer/services/oauth.ts',
] as const;
const CLASSIFICATIONS = [
  'semantic-port',
  'mobile-extension',
  'explicit-exclusion',
  'blocked',
] as const;

type Classification = (typeof CLASSIFICATIONS)[number];

type DesktopFileRecord = {
  classification: Classification;
  evidence: string[];
  reason: string;
  source: string;
  sourceSha256: string;
  target?: string;
};

type MobileFileRecord = {
  classification: 'semantic-port' | 'mobile-extension';
  desktopSources?: string[];
  evidence: string[];
  reason: string;
  target: string;
  targetSha256: string;
};

export type OAuthDesktopSyncMap = {
  desktop: {
    commit: string;
    files: DesktopFileRecord[];
    repository: string;
    sourcePaths: string[];
  };
  mobile: {
    files: MobileFileRecord[];
    ownedFiles: string[];
    sourceRoot: typeof OAUTH_ROOT;
  };
  schemaVersion: 1;
};

export type OAuthDesktopSyncAudit = {
  blocked: string[];
  counts: {
    blocked: number;
    desktopFiles: number;
    mobileExtensions: number;
    mobileFiles: number;
    semanticPorts: number;
  };
  desktopCommit: string;
  errors: string[];
  ok: boolean;
  sourceDrift: string[];
  targetDrift: string[];
};

type AuditOptions = {
  desktopRoot: string;
  mapPath?: string;
  mobileRoot?: string;
};

function git(root: string, args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function gitLines(root: string, args: string[]): string[] {
  const output = git(root, args);
  return output ? output.split('\n').filter(Boolean).sort() : [];
}

function sha256(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

async function fileSha256(file: string): Promise<string> {
  return sha256(await readFile(file));
}

async function filesBelow(directory: string, root = directory): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return filesBelow(absolute, root);
      return entry.isFile() ? [path.relative(root, absolute).replaceAll(path.sep, '/')] : [];
    }),
  );
  return files.flat().sort();
}

async function assertRepository(root: string, expectedName: string): Promise<void> {
  const [actualRoot, canonicalRoot] = await Promise.all([
    realpath(git(root, ['rev-parse', '--show-toplevel'])),
    realpath(root),
  ]);
  if (actualRoot !== canonicalRoot) throw new Error(`${root} is not a Git repository root`);

  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as {
    name?: string;
  };
  if (packageJson.name !== expectedName) {
    throw new Error(`${root} has package identity ${packageJson.name ?? '<missing>'}`);
  }
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicate.add(value);
    seen.add(value);
  }
  return [...duplicate].sort();
}

function difference(left: readonly string[], right: readonly string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value)).sort();
}

function validateRepoPath(repoPath: string, label: string, errors: string[]): void {
  if (
    !repoPath ||
    path.isAbsolute(repoPath) ||
    repoPath.includes('\\') ||
    repoPath.split('/').includes('..')
  ) {
    errors.push(`${label} is not a repository-relative path: ${repoPath}`);
  }
}

function validateDesktopRecord(record: DesktopFileRecord, index: number, errors: string[]): void {
  const label = `desktop.files[${index}]`;
  validateRepoPath(record.source, `${label}.source`, errors);
  if (record.target) validateRepoPath(record.target, `${label}.target`, errors);
  if (!CLASSIFICATIONS.includes(record.classification)) {
    errors.push(`${label} has an invalid classification`);
  }
  if (!/^[a-f0-9]{64}$/.test(record.sourceSha256)) {
    errors.push(`${label} has an invalid source hash`);
  }
  if (!record.reason.trim()) errors.push(`${label} has no reason`);
  if (!record.evidence.length) errors.push(`${label} has no evidence`);
  if (record.classification === 'semantic-port' && !record.target) {
    errors.push(`${label} semantic port has no target`);
  }
  if (
    (record.classification === 'blocked' || record.classification === 'explicit-exclusion') &&
    record.target
  ) {
    errors.push(`${label} ${record.classification} record must not claim a target`);
  }
}

function validateMobileRecord(record: MobileFileRecord, index: number, errors: string[]): void {
  const label = `mobile.files[${index}]`;
  validateRepoPath(record.target, `${label}.target`, errors);
  if (!['semantic-port', 'mobile-extension'].includes(record.classification)) {
    errors.push(`${label} has an invalid classification`);
  }
  if (!/^[a-f0-9]{64}$/.test(record.targetSha256)) {
    errors.push(`${label} has an invalid target hash`);
  }
  if (!record.reason.trim()) errors.push(`${label} has no reason`);
  if (!record.evidence.length) errors.push(`${label} has no evidence`);
  if (record.classification === 'semantic-port' && !record.desktopSources?.length) {
    errors.push(`${label} semantic port has no desktop source`);
  }
  if (record.classification === 'mobile-extension' && record.desktopSources?.length) {
    errors.push(`${label} mobile extension must not claim a desktop source`);
  }
}

async function evidenceExists(
  reference: string,
  desktopRoot: string,
  mobileRoot: string,
): Promise<boolean> {
  const separator = reference.indexOf(':');
  const owner = reference.slice(0, separator);
  const repoPath = reference.slice(separator + 1);
  if (separator < 1 || (owner !== 'desktop' && owner !== 'mobile')) return false;
  try {
    await access(path.join(owner === 'desktop' ? desktopRoot : mobileRoot, repoPath));
    return true;
  } catch {
    return false;
  }
}

function validateRuntimeBoundary(source: string, errors: string[]): void {
  const forbidden = [
    [/https?:\/\//i, 'provider URL'],
    [/\b(?:302ai|aihubmix|aionly|copilot|ppio|silicon)\b/i, 'provider id'],
    [/\b(?:AES|WebView|authorization_pending|device_code|slow_down)\b/i, 'provider flow logic'],
    [/switch\s*\(\s*(?:provider|providerId)/, 'provider switch'],
  ] as const;
  for (const [pattern, label] of forbidden) {
    if (pattern.test(source)) errors.push(`OAuthRuntimeService contains ${label}`);
  }
}

export async function auditOAuthDesktopSync(options: AuditOptions): Promise<OAuthDesktopSyncAudit> {
  const mobileRoot = options.mobileRoot ?? REPO_ROOT;
  const mapPath = options.mapPath ?? path.join(mobileRoot, OAUTH_ROOT, 'desktop-sync-map.json');
  await Promise.all([
    assertRepository(options.desktopRoot, 'CherryStudio'),
    assertRepository(mobileRoot, 'cherry-studio-app'),
  ]);

  const map = JSON.parse(await readFile(mapPath, 'utf8')) as OAuthDesktopSyncMap;
  if (map.schemaVersion !== 1) throw new Error('Unsupported OAuth provenance schema');
  if (
    map.desktop.repository !== 'https://github.com/CherryHQ/cherry-studio.git' ||
    !/^[a-f0-9]{40}$/.test(map.desktop.commit) ||
    map.mobile.sourceRoot !== OAUTH_ROOT ||
    JSON.stringify(map.desktop.sourcePaths) !== JSON.stringify(DESKTOP_SOURCE_PATHS)
  ) {
    throw new Error('OAuth provenance source roots do not match the guarded scope');
  }

  const desktopStatus = git(options.desktopRoot, [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--',
    ...DESKTOP_SOURCE_PATHS,
  ]);
  if (desktopStatus) throw new Error('Desktop OAuth sources must be clean before provenance audit');

  const errors: string[] = [];
  const desktopSources = map.desktop.files.map((record) => record.source);
  const mobileTargets = map.mobile.files.map((record) => record.target);
  for (const duplicate of duplicates(map.mobile.ownedFiles)) {
    errors.push(`duplicate owned mobile file: ${duplicate}`);
  }
  map.mobile.ownedFiles.forEach((repoPath, index) =>
    validateRepoPath(repoPath, `mobile.ownedFiles[${index}]`, errors),
  );
  const currentDesktopSources = gitLines(options.desktopRoot, [
    'ls-files',
    '--',
    ...DESKTOP_SOURCE_PATHS,
  ]);
  const currentOAuthFiles = (await filesBelow(path.join(mobileRoot, OAUTH_ROOT)))
    .filter((file) => /\.(?:md|ts|tsx)$/.test(file))
    .map((file) => `${OAUTH_ROOT}/${file}`);
  const expectedMobileTargets = [
    ...new Set([...currentOAuthFiles, ...map.mobile.ownedFiles]),
  ].sort();

  for (const duplicate of duplicates(desktopSources)) {
    errors.push(`duplicate desktop source: ${duplicate}`);
  }
  for (const duplicate of duplicates(mobileTargets)) errors.push(`duplicate target: ${duplicate}`);
  for (const source of difference(currentDesktopSources, desktopSources)) {
    errors.push(`unmapped desktop source: ${source}`);
  }
  for (const source of difference(desktopSources, currentDesktopSources)) {
    errors.push(`missing desktop source: ${source}`);
  }
  for (const target of difference(expectedMobileTargets, mobileTargets)) {
    errors.push(`unmapped mobile target: ${target}`);
  }
  for (const target of difference(mobileTargets, expectedMobileTargets)) {
    errors.push(`unexpected mobile target: ${target}`);
  }

  map.desktop.files.forEach((record, index) => validateDesktopRecord(record, index, errors));
  map.mobile.files.forEach((record, index) => validateMobileRecord(record, index, errors));

  const desktopSourceSet = new Set(desktopSources);
  const desktopRecords = new Map(map.desktop.files.map((record) => [record.source, record]));
  const mobileTargetSet = new Set(mobileTargets);
  for (const record of map.desktop.files) {
    if (record.target && !mobileTargetSet.has(record.target)) {
      errors.push(`${record.source} references unknown target: ${record.target}`);
    }
    const targetRecord = map.mobile.files.find((candidate) => candidate.target === record.target);
    if (
      record.classification === 'semantic-port' &&
      targetRecord &&
      !targetRecord.desktopSources?.includes(record.source)
    ) {
      errors.push(`${record.source} is missing from its target desktop sources`);
    }
  }
  for (const record of map.mobile.files) {
    for (const source of record.desktopSources ?? []) {
      if (!desktopSourceSet.has(source)) {
        errors.push(`${record.target} references unknown desktop source: ${source}`);
      } else if (desktopRecords.get(source)?.classification !== 'semantic-port') {
        errors.push(`${record.target} references non-port desktop source: ${source}`);
      }
    }
  }

  const sourceDrift: string[] = [];
  for (const record of map.desktop.files) {
    try {
      if (
        (await fileSha256(path.join(options.desktopRoot, record.source))) !== record.sourceSha256
      ) {
        sourceDrift.push(record.source);
      }
    } catch {
      errors.push(`unreadable desktop source: ${record.source}`);
    }
  }

  const targetDrift: string[] = [];
  for (const record of map.mobile.files) {
    try {
      if ((await fileSha256(path.join(mobileRoot, record.target))) !== record.targetSha256) {
        targetDrift.push(record.target);
      }
    } catch {
      targetDrift.push(record.target);
    }
  }

  const evidence = new Set([
    ...map.desktop.files.flatMap((record) => record.evidence),
    ...map.mobile.files.flatMap((record) => record.evidence),
  ]);
  for (const reference of [...evidence].sort()) {
    if (!(await evidenceExists(reference, options.desktopRoot, mobileRoot))) {
      errors.push(`missing evidence: ${reference}`);
    }
  }

  validateRuntimeBoundary(
    await readFile(path.join(mobileRoot, OAUTH_ROOT, 'runtime/OAuthRuntimeService.ts'), 'utf8'),
    errors,
  );

  const blocked = map.desktop.files
    .filter((record) => record.classification === 'blocked')
    .map((record) => record.source)
    .sort();
  return {
    blocked,
    counts: {
      blocked: blocked.length,
      desktopFiles: map.desktop.files.length,
      mobileExtensions: map.mobile.files.filter(
        (record) => record.classification === 'mobile-extension',
      ).length,
      mobileFiles: map.mobile.files.length,
      semanticPorts: map.desktop.files.filter((record) => record.classification === 'semantic-port')
        .length,
    },
    desktopCommit: git(options.desktopRoot, ['rev-parse', 'HEAD']),
    errors: [...new Set(errors)].sort(),
    ok: errors.length === 0 && sourceDrift.length === 0 && targetDrift.length === 0,
    sourceDrift: [...new Set(sourceDrift)].sort(),
    targetDrift: [...new Set(targetDrift)].sort(),
  };
}

function parseArguments(argv: string[]): { desktopRoot: string; json: boolean } {
  let desktopRoot = process.env.CHERRY_STUDIO_DESKTOP_ROOT;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') {
      json = true;
      continue;
    }
    if (argument === '--desktop-root') {
      desktopRoot = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument.startsWith('--desktop-root=')) {
      desktopRoot = argument.slice('--desktop-root='.length);
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (!desktopRoot) throw new Error('Pass --desktop-root or CHERRY_STUDIO_DESKTOP_ROOT');
  return { desktopRoot, json };
}

async function main(): Promise<void> {
  const { desktopRoot, json } = parseArguments(process.argv.slice(2));
  const report = await auditOAuthDesktopSync({ desktopRoot, mapPath: MAP_PATH });
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `OAuth provenance: ${report.counts.desktopFiles} desktop and ${report.counts.mobileFiles} mobile files.`,
    );
    console.log(
      `Classified ${report.counts.semanticPorts} semantic ports, ${report.counts.mobileExtensions} mobile extensions, and ${report.counts.blocked} visible blockers.`,
    );
    for (const issue of [...report.errors, ...report.sourceDrift, ...report.targetDrift]) {
      console.error(issue);
    }
  }
  if (!report.ok) process.exitCode = 1;
}

const entrypoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (entrypoint === import.meta.url) void main();
