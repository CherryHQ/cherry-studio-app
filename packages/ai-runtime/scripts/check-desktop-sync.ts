import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { collectBoundaryViolations } from './check-boundaries';

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const MOBILE_ROOT = path.resolve(PACKAGE_ROOT, '../..');
const MAP_PATH = path.join(PACKAGE_ROOT, 'desktop-sync-map.json');
const CLASSIFICATIONS = [
  'semantic-port',
  'mobile-extension',
  'explicit-exclusion',
  'blocked',
] as const;

type Classification = (typeof CLASSIFICATIONS)[number];

type ProvenanceRecord = {
  classification: Classification;
  evidence: string[];
  reason: string;
  source: string;
  sourceSha256: string;
  target?: string;
  targetSha256?: string;
};

type MobileProvenanceRecord = ProvenanceRecord & {
  desktopSource?: string;
};

type OwnedTargetRecord = {
  classification: 'mobile-extension';
  evidence: string[];
  reason: string;
  target: string;
  targetSha256: string;
};

export type DesktopSyncMap = {
  schemaVersion: 2;
  backendOwned: OwnedTargetRecord[];
  desktop: {
    commit: string;
    files: ProvenanceRecord[];
    repository: string;
    sourceRoot: 'src/main/ai';
  };
  mobile: {
    commit: string;
    files: MobileProvenanceRecord[];
    sourceRoot: 'src/backend/ai';
  };
  packageOwned: OwnedTargetRecord[];
};

export type DesktopSyncAudit = {
  blocked: string[];
  counts: {
    blocked: number;
    desktopFiles: number;
    explicitExclusions: number;
    mobileExtensions: number;
    mobileFiles: number;
    packageFiles: number;
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
  packageRoot?: string;
};

function git(root: string, args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function gitLines(root: string, args: string[]): string[] {
  const output = git(root, args);
  return output ? output.split('\n').filter(Boolean).sort() : [];
}

function gitFileSha256(root: string, commit: string, repoPath: string): string {
  return sha256(execFileSync('git', ['-C', root, 'show', `${commit}:${repoPath}`]));
}

function gitPathExists(root: string, commit: string, repoPath: string): boolean {
  try {
    execFileSync('git', ['-C', root, 'cat-file', '-e', `${commit}:${repoPath}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
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

function sha256(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

async function fileSha256(file: string): Promise<string> {
  return sha256(await readFile(file));
}

async function filesBelow(directory: string, root = directory): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory()
        ? filesBelow(entryPath, root)
        : Promise.resolve([path.relative(root, entryPath)]);
    }),
  );
  return nested.flat().sort();
}

function duplicates(items: string[]): string[] {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const item of items) {
    if (seen.has(item)) duplicate.add(item);
    seen.add(item);
  }
  return [...duplicate].sort();
}

function difference(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item)).sort();
}

function validateRepoPath(repoPath: string, label: string, errors: string[]): void {
  if (
    !repoPath ||
    path.isAbsolute(repoPath) ||
    repoPath.split('/').some((segment) => segment === '..' || segment === '')
  ) {
    errors.push(`${label} is not a repository-relative path: ${repoPath}`);
  }
}

function validateRecord(
  record: ProvenanceRecord,
  label: string,
  errors: string[],
  options: { allowDesktopSource?: boolean } = {},
): void {
  validateRepoPath(record.source, `${label}.source`, errors);
  if (!CLASSIFICATIONS.includes(record.classification)) {
    errors.push(`${label} has unsupported classification: ${record.classification}`);
  }
  if (!record.reason.trim()) errors.push(`${label} has no reason`);
  if (!Array.isArray(record.evidence) || record.evidence.length === 0) {
    errors.push(`${label} has no evidence`);
  }
  if (!/^[a-f0-9]{64}$/.test(record.sourceSha256)) {
    errors.push(`${label} has an invalid source hash`);
  }
  if (record.target) {
    validateRepoPath(record.target, `${label}.target`, errors);
    if (!/^[a-f0-9]{64}$/.test(record.targetSha256 ?? '')) {
      errors.push(`${label} has an invalid target hash`);
    }
  } else if (record.targetSha256) {
    errors.push(`${label} has a target hash without a target`);
  }
  if (!options.allowDesktopSource && record.classification === 'semantic-port' && !record.target) {
    errors.push(`${label} semantic port has no target`);
  }
  if (
    (record.classification === 'blocked' || record.classification === 'explicit-exclusion') &&
    record.target
  ) {
    errors.push(`${label} ${record.classification} must not claim a target`);
  }
  if (record.classification === 'mobile-extension' && !record.target) {
    errors.push(`${label} mobile extension has no target`);
  }
}

async function evidenceExists(
  reference: string,
  desktopRoot: string,
  mobileRoot: string,
  mobileCommit: string,
): Promise<boolean> {
  const separator = reference.indexOf(':');
  const owner = reference.slice(0, separator);
  const repoPath = reference.slice(separator + 1);
  if (separator < 1 || (owner !== 'desktop' && owner !== 'mobile')) return false;
  try {
    await access(path.join(owner === 'desktop' ? desktopRoot : mobileRoot, repoPath));
    return true;
  } catch {
    if (owner !== 'mobile') return false;
    return gitPathExists(mobileRoot, mobileCommit, repoPath);
  }
}

export async function auditDesktopSync(options: AuditOptions): Promise<DesktopSyncAudit> {
  const mobileRoot = options.mobileRoot ?? MOBILE_ROOT;
  const packageRoot = options.packageRoot ?? path.join(mobileRoot, 'packages/ai-runtime');
  const mapPath = options.mapPath ?? path.join(packageRoot, 'desktop-sync-map.json');
  await Promise.all([
    assertRepository(options.desktopRoot, 'CherryStudio'),
    assertRepository(mobileRoot, 'cherry-studio-app'),
  ]);

  const desktopStatus = git(options.desktopRoot, ['status', '--porcelain', '--', 'src/main/ai']);
  if (desktopStatus) throw new Error('Desktop src/main/ai must be clean before provenance audit');

  const map = JSON.parse(await readFile(mapPath, 'utf8')) as DesktopSyncMap;
  if (map.schemaVersion !== 2)
    throw new Error(`Unsupported provenance schema: ${map.schemaVersion}`);

  const errors: string[] = [];
  const desktopSources = map.desktop.files.map((record) => record.source);
  const mobileSources = map.mobile.files.map((record) => record.source);
  const currentDesktopSources = gitLines(options.desktopRoot, [
    'ls-files',
    '--',
    map.desktop.sourceRoot,
  ]);
  const baselineMobileSources = gitLines(mobileRoot, [
    'ls-tree',
    '-r',
    '--name-only',
    map.mobile.commit,
    '--',
    map.mobile.sourceRoot,
  ]);
  const currentBackendFiles = gitLines(mobileRoot, ['ls-files', '--', map.mobile.sourceRoot]);

  for (const duplicate of duplicates(desktopSources))
    errors.push(`duplicate desktop source: ${duplicate}`);
  for (const duplicate of duplicates(mobileSources))
    errors.push(`duplicate mobile source: ${duplicate}`);
  for (const source of difference(currentDesktopSources, desktopSources)) {
    errors.push(`unmapped desktop source: ${source}`);
  }
  for (const source of difference(desktopSources, currentDesktopSources)) {
    errors.push(`missing desktop source: ${source}`);
  }
  for (const source of difference(baselineMobileSources, mobileSources)) {
    errors.push(`unmapped baseline mobile source: ${source}`);
  }
  for (const source of difference(mobileSources, baselineMobileSources)) {
    errors.push(`missing baseline mobile source: ${source}`);
  }

  map.desktop.files.forEach((record, index) =>
    validateRecord(record, `desktop.files[${index}]`, errors),
  );
  map.mobile.files.forEach((record, index) => {
    validateRecord(record, `mobile.files[${index}]`, errors, {
      allowDesktopSource: Boolean(record.desktopSource),
    });
    const desktopRecord = record.desktopSource
      ? map.desktop.files.find((candidate) => candidate.source === record.desktopSource)
      : undefined;
    if (record.desktopSource && !desktopRecord) {
      errors.push(
        `mobile.files[${index}] references unknown desktop source: ${record.desktopSource}`,
      );
    }
    if (desktopRecord && desktopRecord.classification !== 'semantic-port') {
      errors.push(
        `mobile.files[${index}] delegates to non-port desktop source: ${record.desktopSource}`,
      );
    }
    if (record.desktopSource && record.classification !== 'semantic-port') {
      errors.push(`mobile.files[${index}] desktop delegation must be a semantic-port`);
    }
    if (record.desktopSource && record.target) {
      errors.push(`mobile.files[${index}] delegates to desktop and also claims a target`);
    }
  });
  const validateOwnedTarget = (
    record: OwnedTargetRecord,
    owner: 'backendOwned' | 'packageOwned',
    index: number,
  ) => {
    validateRepoPath(record.target, `${owner}[${index}].target`, errors);
    if (record.classification !== 'mobile-extension') {
      errors.push(`${owner}[${index}] must be a mobile-extension`);
    }
    if (!record.reason.trim()) errors.push(`${owner}[${index}] has no reason`);
    if (record.evidence.length === 0) errors.push(`${owner}[${index}] has no evidence`);
    if (!/^[a-f0-9]{64}$/.test(record.targetSha256)) {
      errors.push(`${owner}[${index}] has an invalid target hash`);
    }
  };
  map.backendOwned.forEach((record, index) => validateOwnedTarget(record, 'backendOwned', index));
  map.packageOwned.forEach((record, index) => validateOwnedTarget(record, 'packageOwned', index));

  const targets = [
    ...map.desktop.files.flatMap((record) => (record.target ? [record.target] : [])),
    ...map.mobile.files.flatMap((record) => (record.target ? [record.target] : [])),
    ...map.backendOwned.map((record) => record.target),
    ...map.packageOwned.map((record) => record.target),
  ];
  for (const duplicate of duplicates(targets)) errors.push(`duplicate target: ${duplicate}`);

  const currentPackageFiles = (await filesBelow(path.join(packageRoot, 'src'))).map(
    (file) => `packages/ai-runtime/src/${file}`,
  );
  const mappedPackageFiles = targets.filter((target) =>
    target.startsWith('packages/ai-runtime/src/'),
  );
  for (const file of difference(currentPackageFiles, mappedPackageFiles)) {
    errors.push(`unmapped package target: ${file}`);
  }
  for (const file of difference(mappedPackageFiles, currentPackageFiles)) {
    errors.push(`missing package target: ${file}`);
  }
  const mappedBackendFiles = targets.filter((target) =>
    target.startsWith(`${map.mobile.sourceRoot}/`),
  );
  for (const file of difference(currentBackendFiles, mappedBackendFiles)) {
    errors.push(`unmapped backend target: ${file}`);
  }
  for (const file of difference(mappedBackendFiles, currentBackendFiles)) {
    errors.push(`missing backend target: ${file}`);
  }

  const sourceDrift: string[] = [];
  for (const record of map.desktop.files) {
    try {
      if (
        (await fileSha256(path.join(options.desktopRoot, record.source))) === record.sourceSha256
      ) {
        continue;
      }
    } catch {
      errors.push(`unreadable desktop source: ${record.source}`);
    }
    sourceDrift.push(`desktop:${record.source}`);
  }
  for (const record of map.mobile.files) {
    try {
      if (gitFileSha256(mobileRoot, map.mobile.commit, record.source) === record.sourceSha256) {
        continue;
      }
    } catch {
      errors.push(`unreadable mobile source: ${record.source}`);
    }
    sourceDrift.push(`mobile:${record.source}`);
  }

  const targetDrift: string[] = [];
  const targetRecords = [
    ...map.desktop.files.flatMap((record) =>
      record.target ? [{ path: record.target, sha256: record.targetSha256 ?? '' }] : [],
    ),
    ...map.mobile.files.flatMap((record) =>
      record.target ? [{ path: record.target, sha256: record.targetSha256 ?? '' }] : [],
    ),
    ...map.backendOwned.map((record) => ({ path: record.target, sha256: record.targetSha256 })),
    ...map.packageOwned.map((record) => ({ path: record.target, sha256: record.targetSha256 })),
  ];
  for (const target of targetRecords) {
    try {
      if ((await fileSha256(path.join(mobileRoot, target.path))) !== target.sha256) {
        targetDrift.push(target.path);
      }
    } catch {
      targetDrift.push(target.path);
    }
  }

  const evidence = new Set([
    ...map.desktop.files.flatMap((record) => record.evidence),
    ...map.mobile.files.flatMap((record) => record.evidence),
    ...map.backendOwned.flatMap((record) => record.evidence),
    ...map.packageOwned.flatMap((record) => record.evidence),
  ]);
  for (const reference of [...evidence].sort()) {
    if (!(await evidenceExists(reference, options.desktopRoot, mobileRoot, map.mobile.commit))) {
      errors.push(`missing evidence: ${reference}`);
    }
  }

  for (const violation of await collectBoundaryViolations(packageRoot)) {
    errors.push(`boundary violation: ${violation}`);
  }

  const blocked = map.desktop.files
    .filter((record) => record.classification === 'blocked')
    .map((record) => record.source)
    .sort();
  const counts = {
    blocked: blocked.length,
    desktopFiles: map.desktop.files.length,
    explicitExclusions: map.desktop.files.filter(
      (record) => record.classification === 'explicit-exclusion',
    ).length,
    mobileExtensions:
      map.mobile.files.filter((record) => record.classification === 'mobile-extension').length +
      map.backendOwned.length +
      map.packageOwned.length,
    mobileFiles: map.mobile.files.length,
    packageFiles: currentPackageFiles.length,
    semanticPorts: map.desktop.files.filter((record) => record.classification === 'semantic-port')
      .length,
  };
  return {
    blocked,
    counts,
    desktopCommit: git(options.desktopRoot, ['rev-parse', 'HEAD']),
    errors: [...new Set(errors)].sort(),
    ok: errors.length === 0 && sourceDrift.length === 0 && targetDrift.length === 0,
    sourceDrift: sourceDrift.sort(),
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
  const report = await auditDesktopSync({ desktopRoot, mapPath: MAP_PATH });
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `AI runtime provenance: ${report.counts.desktopFiles} desktop, ${report.counts.mobileFiles} mobile, ${report.counts.packageFiles} package files.`,
    );
    console.log(
      `Classified ${report.counts.semanticPorts} semantic ports, ${report.counts.explicitExclusions} explicit exclusions, and ${report.counts.blocked} blocked desktop files.`,
    );
    for (const issue of [...report.errors, ...report.sourceDrift, ...report.targetDrift]) {
      console.error(issue);
    }
  }
  if (!report.ok) process.exitCode = 1;
}

const entrypoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (entrypoint === import.meta.url) void main();
