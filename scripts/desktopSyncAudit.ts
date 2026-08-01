import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const REPO_ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'desktop-sync-manifest.json');

const DOMAIN_STRATEGIES = ['mirror', 'semantic-port', 'opaque-retention'] as const;
const BASELINE_STATUSES = ['aligned', 'unbaselined', 'blocked'] as const;
const CLASSIFICATIONS = [
  'mirror',
  'semantic-port',
  'mobile-extension',
  'opaque-retention',
  'explicit-exclusion',
  'blocked',
] as const;
const MCP_STORAGE_TRANSPORTS = ['inMemory', 'sse', 'stdio', 'streamableHttp'] as const;
const ORDINARY_AGENT_SOURCES = [
  'packages/aiCore/src/core/agents/createAgent.ts',
  'src/main/ai/runtime/aiSdk/Agent.ts',
] as const;

type DomainStrategy = (typeof DOMAIN_STRATEGIES)[number];
type BaselineStatus = (typeof BASELINE_STATUSES)[number];
type Classification = (typeof CLASSIFICATIONS)[number];
type AuditStatus = BaselineStatus | 'drift';

export type ShapeOnlyPort = {
  drops: string;
  keeps: string;
  path: string;
};

export type DesktopSyncDomain = {
  blocker?: string;
  explicitExclusions?: string[];
  mobilePreferenceExtensions?: string[];
  shapeOnlyPorts?: ShapeOnlyPort[];
  sourceCommit: string | null;
  sourcePaths: string[];
  sourceSha256: string | null;
  status: BaselineStatus;
  strategy: DomainStrategy;
  targetPaths: string[];
  virtualIconAdapters?: Record<string, string>;
};

export type DesktopSyncManifest = {
  delegatedManifests?: Record<string, string>;
  domains: Record<string, DesktopSyncDomain>;
  repository: string;
  schemaVersion: number;
};

export type AuditArguments = {
  check: boolean;
  desktopRoot?: string;
  domains: string[];
  help: boolean;
  json: boolean;
};

type FileEntry = {
  key: string;
  repoPath: string;
};

type FileComparison = {
  changed: string[];
  excluded: string[];
  sourceFileCount: number;
  sourceOnly: string[];
  targetFileCount: number;
  targetOnly: string[];
};

type Invariant = {
  domain: string;
  id: string;
  message: string;
  ok: boolean;
};

export type DomainAudit = {
  baseline: {
    sourceCommit: string | null;
    sourceSha256: string | null;
    status: BaselineStatus;
  };
  blockers: string[];
  classifications: Record<Classification, string[]>;
  currentSourceSha256: string;
  details?: unknown;
  id: string;
  issues: string[];
  sourceFileCount: number;
  status: AuditStatus;
  strategy: DomainStrategy;
};

export type DesktopSyncAuditReport = {
  check: {
    failingDomains: string[];
    invariantFailures: string[];
    ok: boolean;
  };
  desktop: {
    commit: string;
  };
  domains: DomainAudit[];
  invariants: Invariant[];
  manifest: {
    repository: string;
    schemaVersion: number;
  };
  mobile: {
    commit: string;
  };
  schemaVersion: 1;
};

type AuditRepositoriesOptions = {
  desktopRoot: string;
  domains?: string[];
  manifest?: DesktopSyncManifest;
  manifestPath?: string;
  mobileRoot?: string;
};

function usage(): string {
  return [
    'Usage: pnpm desktop:sync:audit --desktop-root <path> [options]',
    '',
    'Options:',
    '  --domain <domain>  Audit one domain; repeat to select more than one',
    '  --json             Emit stable machine-readable JSON',
    '  --check            Exit non-zero on drift, missing baselines, blockers, or invariant failures',
    '  --help             Show this help',
    '',
    'CHERRY_STUDIO_DESKTOP_ROOT may provide the desktop root when the flag is omitted.',
  ].join('\n');
}

export function parseArguments(
  argv: string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
): AuditArguments {
  let desktopRoot: string | undefined;
  let check = false;
  let help = false;
  let json = false;
  const domains: string[] = [];

  const readValue = (argument: string, index: number): [string, number] => {
    const equalsAt = argument.indexOf('=');
    if (equalsAt >= 0) {
      const value = argument.slice(equalsAt + 1);
      if (!value) throw new Error(`Missing value for ${argument.slice(0, equalsAt)}`);
      return [value, index];
    }

    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
    return [value, index + 1];
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      help = true;
      continue;
    }
    if (argument === '--check') {
      check = true;
      continue;
    }
    if (argument === '--json') {
      json = true;
      continue;
    }
    if (argument === '--desktop-root' || argument.startsWith('--desktop-root=')) {
      const [value, consumedIndex] = readValue(argument, index);
      desktopRoot = value;
      index = consumedIndex;
      continue;
    }
    if (argument === '--domain' || argument.startsWith('--domain=')) {
      const [value, consumedIndex] = readValue(argument, index);
      domains.push(value);
      index = consumedIndex;
      continue;
    }
    throw new Error(`Unexpected argument: ${argument}`);
  }

  desktopRoot ??= env.CHERRY_STUDIO_DESKTOP_ROOT;
  if (!desktopRoot && !help) throw new Error(usage());

  return {
    check,
    desktopRoot: desktopRoot ? path.resolve(desktopRoot) : undefined,
    domains: [...new Set(domains)],
    help,
    json,
  };
}

function run(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    const message = result.stderr.trim() || result.stdout.trim() || `${command} failed`;
    throw new Error(message);
  }
  return result.stdout;
}

function runGit(root: string, args: string[]): string {
  return run('git', args, root);
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertRelativeRepoPath(value: string, label: string): void {
  if (
    !value ||
    path.isAbsolute(value) ||
    value === '..' ||
    value.startsWith(`..${path.sep}`) ||
    value.split(/[\\/]/).includes('..')
  ) {
    throw new Error(`[desktop-sync-audit] ${label} must be a repository-relative path`);
  }
}

function validateDomain(id: string, value: unknown): DesktopSyncDomain {
  if (!isRecord(value)) throw new Error(`[desktop-sync-audit] invalid domain: ${id}`);
  const strategy = value.strategy;
  const status = value.status;
  const sourcePaths = value.sourcePaths;
  const targetPaths = value.targetPaths;
  const sourceCommit = value.sourceCommit;
  const sourceSha256 = value.sourceSha256;

  if (!DOMAIN_STRATEGIES.includes(strategy as DomainStrategy)) {
    throw new Error(`[desktop-sync-audit] ${id} has invalid strategy`);
  }
  if (!BASELINE_STATUSES.includes(status as BaselineStatus)) {
    throw new Error(`[desktop-sync-audit] ${id} has invalid status`);
  }
  if (
    !Array.isArray(sourcePaths) ||
    sourcePaths.length === 0 ||
    !sourcePaths.every((entry) => typeof entry === 'string') ||
    !Array.isArray(targetPaths) ||
    targetPaths.length === 0 ||
    !targetPaths.every((entry) => typeof entry === 'string')
  ) {
    throw new Error(`[desktop-sync-audit] ${id} must declare sourcePaths and targetPaths`);
  }
  for (const sourcePath of sourcePaths as string[]) {
    assertRelativeRepoPath(sourcePath, `${id}.sourcePaths`);
  }
  for (const targetPath of targetPaths as string[]) {
    assertRelativeRepoPath(targetPath, `${id}.targetPaths`);
  }

  const explicitExclusions = value.explicitExclusions;
  if (
    explicitExclusions !== undefined &&
    (!Array.isArray(explicitExclusions) ||
      !explicitExclusions.every((entry) => typeof entry === 'string'))
  ) {
    throw new Error(`[desktop-sync-audit] ${id}.explicitExclusions must be an array`);
  }
  for (const exclusion of (explicitExclusions ?? []) as string[]) {
    assertRelativeRepoPath(exclusion, `${id}.explicitExclusions`);
  }

  const mobilePreferenceExtensions = value.mobilePreferenceExtensions;
  if (
    mobilePreferenceExtensions !== undefined &&
    (!Array.isArray(mobilePreferenceExtensions) ||
      !mobilePreferenceExtensions.every(
        (entry) => typeof entry === 'string' && /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(entry),
      ))
  ) {
    throw new Error(
      `[desktop-sync-audit] ${id}.mobilePreferenceExtensions must be preference keys`,
    );
  }
  if (
    mobilePreferenceExtensions !== undefined &&
    new Set(mobilePreferenceExtensions).size !== mobilePreferenceExtensions.length
  ) {
    throw new Error(`[desktop-sync-audit] ${id}.mobilePreferenceExtensions must be unique`);
  }

  if (status === 'aligned') {
    if (typeof sourceCommit !== 'string' || !/^[0-9a-f]{40}$/.test(sourceCommit)) {
      throw new Error(`[desktop-sync-audit] aligned domain ${id} needs a full sourceCommit`);
    }
    if (typeof sourceSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sourceSha256)) {
      throw new Error(`[desktop-sync-audit] aligned domain ${id} needs sourceSha256`);
    }
  } else if (sourceCommit !== null || sourceSha256 !== null) {
    throw new Error(`[desktop-sync-audit] ${id} must not claim a baseline while ${status}`);
  }

  if (value.blocker !== undefined && typeof value.blocker !== 'string') {
    throw new Error(`[desktop-sync-audit] ${id}.blocker must be a string`);
  }
  if (status === 'blocked' && !value.blocker) {
    throw new Error(`[desktop-sync-audit] blocked domain ${id} must explain its blocker`);
  }

  const virtualIconAdapters = value.virtualIconAdapters;
  if (
    virtualIconAdapters !== undefined &&
    (!isRecord(virtualIconAdapters) ||
      !Object.values(virtualIconAdapters).every((entry) => typeof entry === 'string'))
  ) {
    throw new Error(`[desktop-sync-audit] ${id}.virtualIconAdapters must be a string map`);
  }

  const shapeOnlyPorts = value.shapeOnlyPorts;
  if (
    shapeOnlyPorts !== undefined &&
    (!Array.isArray(shapeOnlyPorts) ||
      !shapeOnlyPorts.every(
        (entry) =>
          isRecord(entry) &&
          typeof entry.path === 'string' &&
          typeof entry.keeps === 'string' &&
          typeof entry.drops === 'string',
      ))
  ) {
    throw new Error(
      `[desktop-sync-audit] ${id}.shapeOnlyPorts must be {path, keeps, drops} entries`,
    );
  }
  for (const port of (shapeOnlyPorts ?? []) as ShapeOnlyPort[]) {
    assertRelativeRepoPath(port.path, `${id}.shapeOnlyPorts`);
  }

  return {
    blocker: value.blocker as string | undefined,
    explicitExclusions: explicitExclusions as string[] | undefined,
    mobilePreferenceExtensions: mobilePreferenceExtensions as string[] | undefined,
    shapeOnlyPorts: shapeOnlyPorts as ShapeOnlyPort[] | undefined,
    sourceCommit: sourceCommit as string | null,
    sourcePaths: sourcePaths as string[],
    sourceSha256: sourceSha256 as string | null,
    status: status as BaselineStatus,
    strategy: strategy as DomainStrategy,
    targetPaths: targetPaths as string[],
    virtualIconAdapters: virtualIconAdapters as Record<string, string> | undefined,
  };
}

export function validateManifest(value: unknown): DesktopSyncManifest {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.repository !== 'string') {
    throw new Error('[desktop-sync-audit] invalid desktop-sync-manifest.json');
  }
  if (!isRecord(value.domains) || Object.keys(value.domains).length === 0) {
    throw new Error('[desktop-sync-audit] manifest must declare domains');
  }

  const domains = Object.fromEntries(
    Object.entries(value.domains)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, domain]) => [id, validateDomain(id, domain)]),
  );

  return {
    delegatedManifests: isRecord(value.delegatedManifests)
      ? (value.delegatedManifests as Record<string, string>)
      : undefined,
    domains,
    repository: value.repository,
    schemaVersion: value.schemaVersion,
  };
}

export async function loadManifest(manifestPath = MANIFEST_PATH): Promise<DesktopSyncManifest> {
  return validateManifest(await readJson(manifestPath));
}

async function assertCheckout(
  root: string,
  expectedPackageName: string,
  label: string,
): Promise<void> {
  const packageJson = await readJson(path.join(root, 'package.json')).catch(() => null);
  if (!isRecord(packageJson) || packageJson.name !== expectedPackageName) {
    throw new Error(`[desktop-sync-audit] ${label} package name must be ${expectedPackageName}`);
  }

  const [actualRoot, gitRoot] = await Promise.all([
    realpath(root),
    realpath(path.resolve(runGit(root, ['rev-parse', '--show-toplevel']).trim())),
  ]);
  if (actualRoot !== gitRoot) {
    throw new Error(`[desktop-sync-audit] ${label} root must be the Git top level`);
  }
}

async function assertPackageName(
  root: string,
  packagePath: string,
  expected: string,
): Promise<void> {
  const packageJson = await readJson(path.join(root, packagePath, 'package.json')).catch(
    () => null,
  );
  if (!isRecord(packageJson) || packageJson.name !== expected) {
    throw new Error(`[desktop-sync-audit] ${packagePath} package name must be ${expected}`);
  }
}

async function assertRepositoryIdentities(desktopRoot: string, mobileRoot: string): Promise<void> {
  await Promise.all([
    assertCheckout(desktopRoot, 'CherryStudio', 'desktop'),
    assertCheckout(mobileRoot, 'cherry-studio-app', 'mobile'),
    assertPackageName(desktopRoot, 'packages/ui', '@cherrystudio/ui'),
    assertPackageName(mobileRoot, 'packages/ui', '@cherrystudio/ui'),
    assertPackageName(desktopRoot, 'packages/aiCore', '@cherrystudio/ai-core'),
    assertPackageName(mobileRoot, 'packages/ai-core', '@cherrystudio/ai-core'),
    assertPackageName(desktopRoot, 'packages/ai-sdk-provider', '@cherrystudio/ai-sdk-provider'),
    assertPackageName(mobileRoot, 'packages/ai-sdk-provider', '@cherrystudio/ai-sdk-provider'),
    assertPackageName(desktopRoot, 'packages/provider-registry', '@cherrystudio/provider-registry'),
    assertPackageName(mobileRoot, 'packages/provider-registry', '@cherrystudio/provider-registry'),
  ]);
}

export function trackedFiles(root: string, pathSpecs: string[]): string[] {
  if (pathSpecs.length === 0) return [];
  return runGit(root, ['ls-files', '-z', '--', ...pathSpecs])
    .split('\0')
    .filter(Boolean)
    .sort();
}

export async function hashTrackedFiles(root: string, files: string[]): Promise<string> {
  const hash = createHash('sha256');
  for (const file of [...new Set(files)].sort()) {
    hash.update(file);
    hash.update('\0');
    hash.update(await readFile(path.join(root, file)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function globToRegExp(glob: string): RegExp {
  let pattern = '^';
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (character === '*') {
      if (glob[index + 1] === '*') {
        pattern += '.*';
        index += 1;
      } else {
        pattern += '[^/]*';
      }
      continue;
    }
    if (character === '?') {
      pattern += '[^/]';
      continue;
    }
    pattern += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }
  return new RegExp(`${pattern}$`);
}

export function pathMatchesGlob(repoPath: string, glob: string): boolean {
  return globToRegExp(glob.replaceAll('\\', '/')).test(repoPath.replaceAll('\\', '/'));
}

async function assertDesktopClean(
  desktopRoot: string,
  selectedDomains: [string, DesktopSyncDomain][],
): Promise<void> {
  const sourcePaths = [
    ...new Set(selectedDomains.flatMap(([, domain]) => domain.sourcePaths)),
  ].sort();
  const dirty = runGit(desktopRoot, [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--',
    ...sourcePaths,
  ]).trim();
  if (dirty) {
    throw new Error(
      `[desktop-sync-audit] selected desktop sources have uncommitted changes:\n${dirty}`,
    );
  }
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function propertyNameText(name: ts.PropertyName | undefined): string | null {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function sourceFileFor(source: string, fileName = 'source.ts'): ts.SourceFile {
  const scriptKind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
}

function findVariableInitializer(
  sourceFile: ts.SourceFile,
  variableName: string,
): ts.Expression | null {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === variableName &&
        declaration.initializer
      ) {
        return unwrapExpression(declaration.initializer);
      }
    }
  }
  return null;
}

export function extractObjectKeys(
  source: string,
  variableName: string,
  nestedProperty?: string,
  fileName = 'source.ts',
): string[] {
  const sourceFile = sourceFileFor(source, fileName);
  let initializer = findVariableInitializer(sourceFile, variableName);
  if (!initializer) throw new Error(`[desktop-sync-audit] missing ${variableName} in ${fileName}`);

  if (nestedProperty) {
    if (!ts.isObjectLiteralExpression(initializer)) {
      throw new Error(`[desktop-sync-audit] ${variableName} is not an object in ${fileName}`);
    }
    const property = initializer.properties.find(
      (candidate) => propertyNameText(candidate.name) === nestedProperty,
    );
    if (!property || !ts.isPropertyAssignment(property)) {
      throw new Error(
        `[desktop-sync-audit] missing ${variableName}.${nestedProperty} in ${fileName}`,
      );
    }
    initializer = unwrapExpression(property.initializer);
  }

  if (!ts.isObjectLiteralExpression(initializer)) {
    throw new Error(`[desktop-sync-audit] ${variableName} is not an object in ${fileName}`);
  }

  const keys = initializer.properties.map((property) => propertyNameText(property.name));
  if (keys.some((key) => key === null)) {
    throw new Error(`[desktop-sync-audit] ${variableName} has a computed key in ${fileName}`);
  }
  return (keys as string[]).sort();
}

export function extractSqliteTableNames(source: string, fileName = 'schema.ts'): string[] {
  const sourceFile = sourceFileFor(source, fileName);
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'sqliteTable' &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      names.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...names].sort();
}

function routeValue(node: ts.Node): ts.Node | null {
  if (ts.isPropertyAssignment(node)) return unwrapExpression(node.initializer);
  if (ts.isPropertySignature(node)) return node.type ?? null;
  return null;
}

export function extractRouteMethods(source: string, fileName = 'routes.ts'): string[] {
  const sourceFile = sourceFileFor(source, fileName);
  const routes = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) || ts.isPropertySignature(node)) {
      const route = propertyNameText(node.name);
      if (route?.startsWith('/')) {
        const value = routeValue(node);
        const members = value
          ? ts.isObjectLiteralExpression(value)
            ? value.properties
            : ts.isTypeLiteralNode(value)
              ? value.members
              : []
          : [];
        const methods = members
          .map((member) => propertyNameText(member.name)?.toUpperCase())
          .filter((method): method is string =>
            ['DELETE', 'GET', 'PATCH', 'POST', 'PUT'].includes(method ?? ''),
          );
        if (methods.length === 0) routes.add(`* ${route}`);
        for (const method of methods) routes.add(`${method} ${route}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...routes].sort();
}

export function extractRegistryModules(
  source: string,
  variableName: string,
  fileName = 'registry.ts',
): string[] {
  const sourceFile = sourceFileFor(source, fileName);
  const imports = new Map<string, string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const importClause = statement.importClause;
    if (importClause?.name) imports.set(importClause.name.text, statement.moduleSpecifier.text);
    const bindings = importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        imports.set(element.name.text, statement.moduleSpecifier.text);
      }
    }
  }

  const initializer = findVariableInitializer(sourceFile, variableName);
  if (!initializer || !ts.isArrayLiteralExpression(initializer)) {
    throw new Error(`[desktop-sync-audit] missing array ${variableName} in ${fileName}`);
  }
  return initializer.elements
    .map((element) => (ts.isIdentifier(element) ? imports.get(element.text) : undefined))
    .filter((modulePath): modulePath is string => Boolean(modulePath))
    .map((modulePath) => modulePath.replace(/^\.\//, '').replace(/\.(?:tsx?|jsx?)$/, ''))
    .sort();
}

export function extractVariableCallStrings(
  source: string,
  variableName: string,
  callName: string,
  fileName = 'source.ts',
): string[] {
  const sourceFile = sourceFileFor(source, fileName);
  const initializer = findVariableInitializer(sourceFile, variableName);
  if (!initializer) throw new Error(`[desktop-sync-audit] missing ${variableName} in ${fileName}`);
  const values = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const name = ts.isPropertyAccessExpression(expression)
        ? expression.name.text
        : ts.isIdentifier(expression)
          ? expression.text
          : null;
      if (name === callName) {
        const argument = node.arguments[0];
        if (argument && ts.isArrayLiteralExpression(argument)) {
          for (const element of argument.elements) {
            if (ts.isStringLiteralLike(element)) values.add(element.text);
          }
        } else if (argument && ts.isStringLiteralLike(argument)) {
          values.add(argument.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(initializer);
  return [...values].sort();
}

function extractEmbeddedRasterMediaTypes(source: string, fileName: string): string[] {
  const sourceFile = sourceFileFor(source, fileName);
  const mediaTypes = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const match = /^data:image\/(png|jpeg|webp);base64,/i.exec(node.text);
      if (match) mediaTypes.add(match[1].toLowerCase());
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...mediaTypes].sort();
}

async function collectEntries(
  root: string,
  bases: string[],
  paired: boolean,
): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  for (const [index, base] of bases.entries()) {
    const absoluteBase = path.join(root, base);
    await access(absoluteBase);
    const baseStat = await stat(absoluteBase);
    for (const repoPath of trackedFiles(root, [base])) {
      const relative = baseStat.isDirectory()
        ? path.relative(base, repoPath)
        : path.basename(repoPath);
      entries.push({ key: paired ? `${index}/${relative}` : relative, repoPath });
    }
  }
  return entries.sort((left, right) => left.key.localeCompare(right.key));
}

async function compareDomainFiles(
  desktopRoot: string,
  mobileRoot: string,
  domain: DesktopSyncDomain,
): Promise<FileComparison> {
  const paired =
    domain.sourcePaths.length === domain.targetPaths.length && domain.sourcePaths.length > 1;
  const [sourceEntries, targetEntries] = await Promise.all([
    collectEntries(desktopRoot, domain.sourcePaths, paired),
    collectEntries(mobileRoot, domain.targetPaths, paired).catch(() => []),
  ]);
  const exclusions = domain.explicitExclusions ?? [];
  const excludedEntries = sourceEntries.filter(({ repoPath }) =>
    exclusions.some((glob) => pathMatchesGlob(repoPath, glob)),
  );
  const includedSource = sourceEntries.filter((entry) => !excludedEntries.includes(entry));
  const sourceByKey = new Map(includedSource.map((entry) => [entry.key, entry]));
  const targetByKey = new Map(targetEntries.map((entry) => [entry.key, entry]));
  const sourceOnly = [...sourceByKey.keys()].filter((key) => !targetByKey.has(key)).sort();
  const targetOnly = [...targetByKey.keys()].filter((key) => !sourceByKey.has(key)).sort();
  const changed: string[] = [];

  for (const [key, sourceEntry] of sourceByKey) {
    const targetEntry = targetByKey.get(key);
    if (!targetEntry) continue;
    const [sourceBytes, targetBytes] = await Promise.all([
      readFile(path.join(desktopRoot, sourceEntry.repoPath)),
      readFile(path.join(mobileRoot, targetEntry.repoPath)).catch(() => null),
    ]);
    if (!targetBytes || !sourceBytes.equals(targetBytes)) changed.push(key);
  }

  return {
    changed: changed.sort(),
    excluded: excludedEntries.map(({ repoPath }) => repoPath).sort(),
    sourceFileCount: includedSource.length,
    sourceOnly,
    targetFileCount: targetEntries.length,
    targetOnly,
  };
}

function emptyClassifications(): Record<Classification, string[]> {
  return {
    blocked: [],
    'explicit-exclusion': [],
    mirror: [],
    'mobile-extension': [],
    'opaque-retention': [],
    'semantic-port': [],
  };
}

function classifyFileComparison(
  strategy: DomainStrategy,
  comparison: FileComparison,
): Record<Classification, string[]> {
  const result = emptyClassifications();
  result['explicit-exclusion'] = comparison.excluded;
  if (strategy === 'mirror') {
    result.mirror = [
      ...comparison.changed,
      ...comparison.sourceOnly,
      ...comparison.targetOnly,
    ].sort();
    return result;
  }

  result[strategy] = comparison.changed;
  result['mobile-extension'] = comparison.targetOnly;
  result.blocked = comparison.sourceOnly;
  return result;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

async function latestSnapshot(root: string): Promise<string> {
  const metaRoot = path.join(root, 'migrations/sqlite-drizzle/meta');
  const snapshot = (await readdir(metaRoot))
    .filter((file) => /^\d+_snapshot\.json$/.test(file))
    .sort()
    .at(-1);
  if (!snapshot) throw new Error('[desktop-sync-audit] no Drizzle snapshot found');
  return path.join(metaRoot, snapshot);
}

async function schemaAstTables(root: string, schemaPath: string): Promise<string[]> {
  const tables = new Set<string>();
  for (const file of trackedFiles(root, [schemaPath])) {
    if (!/\.tsx?$/.test(file) || file.includes('/__tests__/')) continue;
    const source = await readFile(path.join(root, file), 'utf8');
    for (const table of extractSqliteTableNames(source, file)) tables.add(table);
  }
  return [...tables].sort();
}

export async function compareSchemaState(desktopRoot: string, mobileRoot: string) {
  const [desktopSnapshotPath, mobileSnapshotPath, desktopAst, mobileAst] = await Promise.all([
    latestSnapshot(desktopRoot),
    latestSnapshot(mobileRoot),
    schemaAstTables(desktopRoot, 'src/main/data/db/schemas'),
    schemaAstTables(mobileRoot, 'src/backend/data/db/schemas'),
  ]);
  const [desktopSnapshot, mobileSnapshot] = await Promise.all([
    readJson(desktopSnapshotPath),
    readJson(mobileSnapshotPath),
  ]);
  if (!isRecord(desktopSnapshot) || !isRecord(desktopSnapshot.tables)) {
    throw new Error('[desktop-sync-audit] invalid desktop Drizzle snapshot');
  }
  if (!isRecord(mobileSnapshot) || !isRecord(mobileSnapshot.tables)) {
    throw new Error('[desktop-sync-audit] invalid mobile Drizzle snapshot');
  }
  const desktopTables = desktopSnapshot.tables;
  const mobileTables = mobileSnapshot.tables;
  const desktopNames = Object.keys(desktopTables).sort();
  const mobileNames = Object.keys(mobileTables).sort();
  const common = desktopNames.filter((name) => name in mobileTables);
  const changed = common.filter(
    (name) =>
      JSON.stringify(canonicalize(desktopTables[name])) !==
      JSON.stringify(canonicalize(mobileTables[name])),
  );

  return {
    ast: {
      desktop: desktopAst,
      desktopMatchesSnapshot: JSON.stringify(desktopAst) === JSON.stringify(desktopNames),
      mobile: mobileAst,
      mobileMatchesSnapshot: JSON.stringify(mobileAst) === JSON.stringify(mobileNames),
    },
    changed,
    desktopSnapshot: path.basename(desktopSnapshotPath),
    desktopTables: desktopNames,
    extraMobile: mobileNames.filter((name) => !(name in desktopTables)),
    missing: desktopNames.filter((name) => !(name in mobileTables)),
    mobileSnapshot: path.basename(mobileSnapshotPath),
    mobileTables: mobileNames,
  };
}

async function preferenceKeys(root: string, file: string): Promise<string[]> {
  return extractObjectKeys(
    await readFile(path.join(root, file), 'utf8'),
    'DefaultPreferences',
    'default',
    file,
  );
}

async function directTrackedTypeScriptFiles(root: string, directory: string): Promise<string[]> {
  return trackedFiles(root, [directory]).filter(
    (file) => path.dirname(file) === directory && file.endsWith('.ts'),
  );
}

async function routeMethods(root: string, directory: string): Promise<string[]> {
  const routes = new Set<string>();
  for (const file of await directTrackedTypeScriptFiles(root, directory)) {
    const source = await readFile(path.join(root, file), 'utf8');
    for (const route of extractRouteMethods(source, file)) routes.add(route);
  }
  return [...routes].sort();
}

async function auditSharedData(desktopRoot: string, mobileRoot: string) {
  const desktopHandlerPath = 'src/main/data/api/handlers';
  const mobileHandlerPath = 'src/backend/data/api/handlers';
  const desktopSchemaPath = 'src/shared/data/api/schemas';
  const mobileSchemaPath = 'packages/universal/src/data/api/schemas';
  const [
    desktopPreferences,
    mobilePreferences,
    desktopHandlers,
    mobileHandlers,
    desktopRoutes,
    mobileRoutes,
  ] = await Promise.all([
    preferenceKeys(desktopRoot, 'src/shared/data/preference/preferenceSchemas.ts'),
    preferenceKeys(mobileRoot, 'packages/universal/src/data/preference/preferenceSchemas.ts'),
    directTrackedTypeScriptFiles(desktopRoot, desktopHandlerPath),
    directTrackedTypeScriptFiles(mobileRoot, mobileHandlerPath),
    routeMethods(desktopRoot, desktopHandlerPath),
    routeMethods(mobileRoot, mobileHandlerPath),
  ]);
  const [desktopSchemaModules, mobileSchemaModules] = await Promise.all([
    directTrackedTypeScriptFiles(desktopRoot, desktopSchemaPath),
    directTrackedTypeScriptFiles(mobileRoot, mobileSchemaPath),
  ]);
  const desktopHandlerNames = desktopHandlers.map((file) => path.basename(file));
  const mobileHandlerNames = mobileHandlers.map((file) => path.basename(file));
  const desktopSchemaNames = desktopSchemaModules.map((file) => path.basename(file));
  const mobileSchemaNames = mobileSchemaModules.map((file) => path.basename(file));

  return {
    dataApi: {
      desktopHandlerModules: desktopHandlerNames.sort(),
      desktopRoutes,
      desktopSchemaModules: desktopSchemaNames.filter((file) => file !== 'apiSchemas.ts').sort(),
      missingHandlerModules: desktopHandlerNames
        .filter((file) => !mobileHandlerNames.includes(file))
        .sort(),
      missingRoutes: desktopRoutes.filter((route) => !mobileRoutes.includes(route)),
      missingSchemaModules: desktopSchemaNames
        .filter((file) => file !== 'apiSchemas.ts' && !mobileSchemaNames.includes(file))
        .sort(),
      mobileHandlerModules: mobileHandlerNames.sort(),
      mobileRoutes,
      mobileSchemaModules: mobileSchemaNames.filter((file) => file !== 'apiSchemas.ts').sort(),
    },
    preferences: {
      desktopKeys: desktopPreferences,
      mobileKeys: mobilePreferences,
      sourceOnly: desktopPreferences.filter((key) => !mobilePreferences.includes(key)),
      targetOnly: mobilePreferences.filter((key) => !desktopPreferences.includes(key)),
    },
  };
}

export function evaluatePreferenceAlignment(
  desktopKeys: readonly string[],
  mobileKeys: readonly string[],
  declaredMobileExtensions: readonly string[],
) {
  const sourceOnly = desktopKeys.filter((key) => !mobileKeys.includes(key));
  const targetOnly = mobileKeys.filter((key) => !desktopKeys.includes(key));
  const extensionSet = new Set(declaredMobileExtensions);
  const mobileExtensions = targetOnly.filter((key) => extensionSet.has(key));
  const unexpectedMobileKeys = targetOnly.filter((key) => !extensionSet.has(key));
  const staleExtensionDeclarations = declaredMobileExtensions.filter(
    (key) => !targetOnly.includes(key),
  );

  return {
    mobileExtensions,
    ok:
      sourceOnly.length === 0 &&
      unexpectedMobileKeys.length === 0 &&
      staleExtensionDeclarations.length === 0,
    sourceOnly,
    staleExtensionDeclarations,
    unexpectedMobileKeys,
  };
}

async function providerRegistryIds(root: string): Promise<string[]> {
  const file = 'packages/provider-registry/src/providers/index.ts';
  return extractRegistryModules(await readFile(path.join(root, file), 'utf8'), 'PROVIDERS', file);
}

async function auditProviderRegistry(desktopRoot: string, mobileRoot: string) {
  const [desktop, mobile] = await Promise.all([
    providerRegistryIds(desktopRoot),
    providerRegistryIds(mobileRoot),
  ]);
  const readCatalog = async (root: string, file: string, property: string) => {
    const value = await readJson(path.join(root, file));
    if (!isRecord(value) || !Array.isArray(value[property])) {
      throw new Error(`[desktop-sync-audit] invalid provider registry catalog: ${file}`);
    }
    return value[property].length;
  };
  const [desktopModels, mobileModels, desktopOverrides, mobileOverrides] = await Promise.all([
    readCatalog(desktopRoot, 'packages/provider-registry/data/models.json', 'models'),
    readCatalog(mobileRoot, 'packages/provider-registry/data/models.json', 'models'),
    readCatalog(desktopRoot, 'packages/provider-registry/data/provider-models.json', 'overrides'),
    readCatalog(mobileRoot, 'packages/provider-registry/data/provider-models.json', 'overrides'),
  ]);
  return {
    desktop,
    mobile,
    modelCatalogCounts: { desktop: desktopModels, mobile: mobileModels },
    overrideCatalogCounts: { desktop: desktopOverrides, mobile: mobileOverrides },
    sourceOnly: desktop.filter((id) => !mobile.includes(id)),
    targetOnly: mobile.filter((id) => !desktop.includes(id)),
  };
}

async function catalogKeys(root: string, file: string, variableName: string): Promise<string[]> {
  return extractObjectKeys(
    await readFile(path.join(root, file), 'utf8'),
    variableName,
    undefined,
    file,
  );
}

async function embeddedRasterEvidence(desktopRoot: string, id: string) {
  const directory = `packages/ui/src/components/icons/providers/${id}`;
  const files = trackedFiles(desktopRoot, [directory]).filter((file) => /\.tsx?$/.test(file));
  const mediaTypes = new Set<string>();
  for (const file of files) {
    const source = await readFile(path.join(desktopRoot, file), 'utf8');
    for (const mediaType of extractEmbeddedRasterMediaTypes(source, file)) {
      mediaTypes.add(mediaType);
    }
  }
  return {
    mediaTypes: [...mediaTypes].sort(),
    sourceFiles: files,
    sourceSha256: files.length > 0 ? await hashTrackedFiles(desktopRoot, files) : null,
  };
}

export async function auditDesignCatalog(
  desktopRoot: string,
  mobileRoot: string,
  virtualIconAdapters: Record<string, string> = {},
) {
  const desktopCatalogFile = 'packages/ui/src/components/icons/providers/catalog.ts';
  const mobileCatalogFile = 'packages/ui/src/icons-webp/providers/index.ts';
  const [desktopCatalog, mobileCatalog] = await Promise.all([
    catalogKeys(desktopRoot, desktopCatalogFile, 'PROVIDER_ICON_CATALOG'),
    catalogKeys(mobileRoot, mobileCatalogFile, 'PROVIDER_ICONS'),
  ]);
  const virtual = Object.entries(virtualIconAdapters)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, target]) => ({
      id,
      target,
      valid:
        desktopCatalog.includes(id) &&
        target.startsWith('general/') &&
        trackedFiles(mobileRoot, [`packages/ui/icons/${target}.svg`]).length === 1,
    }));
  const unresolved = desktopCatalog.filter(
    (id) => !mobileCatalog.includes(id) && !(id in virtualIconAdapters),
  );
  const manualRasterAdapters = [];
  const missingWithoutRasterSource: string[] = [];
  for (const id of unresolved) {
    const evidence = await embeddedRasterEvidence(desktopRoot, id);
    if (evidence.mediaTypes.length > 0) {
      manualRasterAdapters.push({
        classification: 'semantic-port' as const,
        id,
        output: '72x72 lossless WebP',
        ...evidence,
      });
    } else {
      missingWithoutRasterSource.push(id);
    }
  }

  return {
    catalogOnly: desktopCatalog.filter((id) => !mobileCatalog.includes(id)),
    desktopCatalog,
    manualRasterAdapters,
    missingWithoutRasterSource,
    mobilePhysicalCatalog: mobileCatalog,
    physicalOnly: mobileCatalog.filter((id) => !desktopCatalog.includes(id)),
    virtualAdapters: virtual,
  };
}

async function auditMcpRetention(desktopRoot: string, mobileRoot: string) {
  const desktopFile = 'src/shared/data/types/mcpServer.ts';
  const mobileFile = 'packages/universal/src/data/types/mcpServer.ts';
  const [desktopSource, mobileSource] = await Promise.all([
    readFile(path.join(desktopRoot, desktopFile), 'utf8'),
    readFile(path.join(mobileRoot, mobileFile), 'utf8'),
  ]);
  return {
    desktopStoredTransports: extractVariableCallStrings(
      desktopSource,
      'McpServerTypeSchema',
      'enum',
      desktopFile,
    ),
    mobileRuntimeProjection: extractVariableCallStrings(
      mobileSource,
      'StreamableHttpMcpServerSchema',
      'literal',
      mobileFile,
    ),
    mobileStoredTransports: extractVariableCallStrings(
      mobileSource,
      'McpServerTypeSchema',
      'enum',
      mobileFile,
    ),
  };
}

function addClassification(
  classifications: Record<Classification, string[]>,
  classification: Classification,
  values: string[],
): void {
  classifications[classification] = [
    ...new Set([...classifications[classification], ...values]),
  ].sort();
}

function addInvariant(invariants: Invariant[], invariant: Invariant): void {
  invariants.push(invariant);
}

async function auditDomain(
  id: string,
  domain: DesktopSyncDomain,
  desktopRoot: string,
  mobileRoot: string,
  invariants: Invariant[],
): Promise<DomainAudit> {
  const sourceFiles = trackedFiles(desktopRoot, domain.sourcePaths);
  const currentSourceSha256 = await hashTrackedFiles(desktopRoot, sourceFiles);
  const comparison =
    id === 'design-catalog'
      ? {
          changed: [],
          excluded: [],
          sourceFileCount: sourceFiles.length,
          sourceOnly: [],
          targetFileCount: trackedFiles(mobileRoot, domain.targetPaths).length,
          targetOnly: [],
        }
      : await compareDomainFiles(desktopRoot, mobileRoot, domain);
  const classifications = classifyFileComparison(domain.strategy, comparison);
  const issues: string[] = [];
  const blockers = [...classifications.blocked];
  let details: unknown;

  const mirrorDrift = domain.strategy === 'mirror' && classifications.mirror.length > 0;
  const sourceDrift = domain.status === 'aligned' && currentSourceSha256 !== domain.sourceSha256;
  let status: AuditStatus = domain.status;
  if (domain.status === 'aligned' && (mirrorDrift || sourceDrift)) status = 'drift';
  if (sourceDrift) issues.push('source-hash-drift');
  if (mirrorDrift) issues.push('mirror-drift');
  if (domain.status === 'unbaselined') issues.push('baseline-missing');
  if (domain.status === 'blocked') {
    issues.push('domain-blocked');
    if (domain.blocker) blockers.push(domain.blocker);
  }

  if (id === 'schema') {
    const schema = await compareSchemaState(desktopRoot, mobileRoot);
    details = schema;
    addClassification(
      classifications,
      'blocked',
      schema.missing.map((table) => `table:${table}`),
    );
    blockers.push(...schema.missing.map((table) => `Missing persisted table: ${table}`));
    addInvariant(invariants, {
      domain: id,
      id: 'desktop-schema-ast-matches-snapshot',
      message: 'Desktop sqliteTable declarations must match the latest tracked snapshot.',
      ok: schema.ast.desktopMatchesSnapshot,
    });
    addInvariant(invariants, {
      domain: id,
      id: 'mobile-schema-ast-matches-snapshot',
      message: 'Mobile sqliteTable declarations must match the latest tracked snapshot.',
      ok: schema.ast.mobileMatchesSnapshot,
    });
    addInvariant(invariants, {
      domain: id,
      id: 'all-desktop-tables-retained',
      message: 'Mobile must retain every desktop table, including Agent and Knowledge data.',
      ok: schema.missing.length === 0,
    });
  }

  if (id === 'shared-data') {
    const sharedData = await auditSharedData(desktopRoot, mobileRoot);
    const mcp = await auditMcpRetention(desktopRoot, mobileRoot);
    const preferenceAlignment = evaluatePreferenceAlignment(
      sharedData.preferences.desktopKeys,
      sharedData.preferences.mobileKeys,
      domain.mobilePreferenceExtensions ?? [],
    );
    details = { ...sharedData, mcp, preferenceAlignment };
    addClassification(
      classifications,
      'blocked',
      sharedData.dataApi.missingRoutes.map((route) => `route:${route}`),
    );
    addClassification(
      classifications,
      'mobile-extension',
      preferenceAlignment.mobileExtensions.map((key) => `preference:${key}`),
    );
    addInvariant(invariants, {
      domain: id,
      id: 'preference-key-set-aligned',
      message: 'Preference key additions and removals require an explicit value migration.',
      ok: preferenceAlignment.ok,
    });
    addInvariant(invariants, {
      domain: id,
      id: 'mcp-storage-retains-all-transports',
      message: 'Storage must retain stdio, SSE, Streamable HTTP, and in-memory MCP records.',
      ok:
        JSON.stringify(mcp.desktopStoredTransports) === JSON.stringify(MCP_STORAGE_TRANSPORTS) &&
        JSON.stringify(mcp.mobileStoredTransports) === JSON.stringify(MCP_STORAGE_TRANSPORTS),
    });
    addInvariant(invariants, {
      domain: id,
      id: 'mcp-runtime-projects-streamable-http',
      message: 'The mobile runtime/UI projection must expose only Streamable HTTP.',
      ok: JSON.stringify(mcp.mobileRuntimeProjection) === JSON.stringify(['streamableHttp']),
    });
  }

  if (id === 'provider-registry') {
    const registry = await auditProviderRegistry(desktopRoot, mobileRoot);
    details = registry;
    addClassification(
      classifications,
      'blocked',
      registry.sourceOnly.map((provider) => `provider:${provider}`),
    );
  }

  if (id === 'design-catalog') {
    const design = await auditDesignCatalog(desktopRoot, mobileRoot, domain.virtualIconAdapters);
    details = design;
    addClassification(
      classifications,
      'semantic-port',
      design.manualRasterAdapters.map(({ id: iconId }) => `provider-icon:${iconId}`),
    );
    addClassification(
      classifications,
      'blocked',
      design.missingWithoutRasterSource.map((iconId) => `provider-icon:${iconId}`),
    );
    addClassification(
      classifications,
      'mobile-extension',
      design.virtualAdapters.map(({ id: iconId, target }) => `provider-icon:${iconId}->${target}`),
    );
    addInvariant(invariants, {
      domain: id,
      id: 'virtual-provider-icon-adapters-resolve',
      message: 'Every virtual provider icon adapter must resolve to a tracked general SVG.',
      ok: design.virtualAdapters.every(({ valid }) => valid),
    });
    addInvariant(invariants, {
      domain: id,
      id: 'catalog-provider-icons-adapted',
      message: 'Catalog-only raster icons require a provenance-tracked lossless WebP adaptation.',
      ok:
        design.manualRasterAdapters.length === 0 && design.missingWithoutRasterSource.length === 0,
    });
  }

  if (id === 'ai-runtime') {
    const exclusions = domain.explicitExclusions ?? [];
    const ordinaryAgentExcluded = ORDINARY_AGENT_SOURCES.filter((source) =>
      exclusions.some((glob) => pathMatchesGlob(source, glob)),
    );
    addInvariant(invariants, {
      domain: id,
      id: 'ordinary-chat-agent-is-not-excluded',
      message: 'Ordinary AI SDK Agent primitives must remain in synchronization scope.',
      ok: ordinaryAgentExcluded.length === 0,
    });
    if (classifications.blocked.length > 0) {
      blockers.push(
        `${classifications.blocked.length} non-excluded desktop AI files lack a same-path mobile implementation or explicit equivalence mapping.`,
      );
    }
  }

  if (id === 'ai-core') {
    const ordinaryAgentFile = ORDINARY_AGENT_SOURCES[0];
    addInvariant(invariants, {
      domain: id,
      id: 'ai-core-create-agent-mirrored',
      message: 'The ordinary aiCore createAgent primitive is part of the exact mirror.',
      ok:
        sourceFiles.includes(ordinaryAgentFile) &&
        !classifications.mirror.some((file) => file.endsWith('src/core/agents/createAgent.ts')),
    });
  }

  if (id === 'backup') {
    addInvariant(invariants, {
      domain: id,
      id: 'desktop-backup-round-trip-compatible',
      message:
        domain.blocker ??
        'Desktop-restorable table, relation, attachment, logo, preference, cache, and manifest fidelity is required.',
      ok: false,
    });
  }

  if (blockers.length > 0 && !issues.includes('unresolved-blockers')) {
    issues.push('unresolved-blockers');
  }
  if (domain.strategy === 'mirror') {
    addInvariant(invariants, {
      domain: id,
      id: `${id}-exact-mirror`,
      message: `${id} tracked relative file set and bytes must exactly mirror desktop.`,
      ok: !mirrorDrift,
    });
  }

  for (const classification of CLASSIFICATIONS) {
    classifications[classification] = [...new Set(classifications[classification])].sort();
  }

  return {
    baseline: {
      sourceCommit: domain.sourceCommit,
      sourceSha256: domain.sourceSha256,
      status: domain.status,
    },
    blockers: [...new Set(blockers)].sort(),
    classifications,
    currentSourceSha256,
    details,
    id,
    issues: [...new Set(issues)].sort(),
    sourceFileCount: sourceFiles.length,
    status,
    strategy: domain.strategy,
  };
}

export async function auditRepositories(
  options: AuditRepositoriesOptions,
): Promise<DesktopSyncAuditReport> {
  const desktopRoot = path.resolve(options.desktopRoot);
  const mobileRoot = path.resolve(options.mobileRoot ?? REPO_ROOT);
  const manifest = options.manifest ?? (await loadManifest(options.manifestPath));
  await assertRepositoryIdentities(desktopRoot, mobileRoot);

  const requestedDomains = options.domains?.length
    ? [...new Set(options.domains)]
    : Object.keys(manifest.domains);
  const unknown = requestedDomains.filter((id) => !(id in manifest.domains));
  if (unknown.length > 0) {
    throw new Error(`[desktop-sync-audit] unknown domain: ${unknown.sort().join(', ')}`);
  }
  const selectedDomains = requestedDomains
    .sort()
    .map((id) => [id, manifest.domains[id]] as [string, DesktopSyncDomain]);
  await assertDesktopClean(desktopRoot, selectedDomains);

  const [desktopCommit, mobileCommit] = await Promise.all([
    Promise.resolve(runGit(desktopRoot, ['rev-parse', 'HEAD']).trim()),
    Promise.resolve(runGit(mobileRoot, ['rev-parse', 'HEAD']).trim()),
  ]);
  const invariants: Invariant[] = [];
  const domains: DomainAudit[] = [];
  for (const [id, domain] of selectedDomains) {
    domains.push(await auditDomain(id, domain, desktopRoot, mobileRoot, invariants));
  }

  const sortedInvariants = invariants.sort((left, right) => left.id.localeCompare(right.id));
  const failingDomains = domains
    .filter(
      (domain) =>
        domain.status !== 'aligned' ||
        domain.blockers.length > 0 ||
        domain.issues.includes('unresolved-blockers'),
    )
    .map(({ id }) => id)
    .sort();
  const invariantFailures = sortedInvariants
    .filter(({ ok }) => !ok)
    .map(({ id }) => id)
    .sort();

  return {
    check: {
      failingDomains,
      invariantFailures,
      ok: failingDomains.length === 0 && invariantFailures.length === 0,
    },
    desktop: { commit: desktopCommit },
    domains,
    invariants: sortedInvariants,
    manifest: { repository: manifest.repository, schemaVersion: manifest.schemaVersion },
    mobile: { commit: mobileCommit },
    schemaVersion: 1,
  };
}

function renderHumanReport(report: DesktopSyncAuditReport): string {
  const lines = [
    `Desktop sync audit at ${report.desktop.commit}`,
    `Check state: ${report.check.ok ? 'ready' : 'not ready'}`,
    '',
  ];
  for (const domain of report.domains) {
    const classificationCount = CLASSIFICATIONS.reduce(
      (count, classification) => count + domain.classifications[classification].length,
      0,
    );
    lines.push(
      `${domain.id}: ${domain.status} (${domain.sourceFileCount} source files, ${classificationCount} classified differences, ${domain.blockers.length} blockers)`,
    );
  }
  if (report.check.invariantFailures.length > 0) {
    lines.push('', `Invariant failures: ${report.check.invariantFailures.join(', ')}`);
  }
  if (report.check.failingDomains.length > 0) {
    lines.push(`Failing domains: ${report.check.failingDomains.join(', ')}`);
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const report = await auditRepositories({
    desktopRoot: args.desktopRoot as string,
    domains: args.domains,
  });
  process.stdout.write(
    args.json ? `${JSON.stringify(report, null, 2)}\n` : renderHumanReport(report),
  );
  if (args.check && !report.check.ok) process.exitCode = 1;
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
