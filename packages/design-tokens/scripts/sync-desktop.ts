import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

import { packageRoot } from './css-contract';

type SyncEntry = {
  destination: string;
  source: string;
};

const repoRoot = path.resolve(packageRoot, '../..');
const stylesDestination = path.join(packageRoot, 'src/styles');
const manifestPath = path.join(packageRoot, 'src/sync-manifest.json');
const routingDestination = path.join(repoRoot, 'packages/ui/src/icons/desktop-routing.ts');

function parseArguments() {
  const args = process.argv.slice(2);
  const inlineRoot = args.find((arg) => arg.startsWith('--desktop-root='))?.split('=')[1];
  const rootFlagIndex = args.indexOf('--desktop-root');
  const flagRoot = rootFlagIndex >= 0 ? args[rootFlagIndex + 1] : undefined;
  const desktopRoot = inlineRoot ?? flagRoot ?? process.env.CHERRY_STUDIO_DESKTOP_ROOT;

  if (!desktopRoot) {
    throw new Error(
      'Usage: pnpm design:sync --desktop-root <path> (or set CHERRY_STUDIO_DESKTOP_ROOT)',
    );
  }

  return { check: args.includes('--check'), desktopRoot: path.resolve(desktopRoot) };
}

function run(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `${command} failed`);
  }
  return result.stdout.trim();
}

async function listFiles(root: string, extension?: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === '.DS_Store') continue;
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      for (const child of await listFiles(absolutePath, extension)) {
        files.push(path.join(entry.name, child));
      }
      continue;
    }
    if (!extension || entry.name.endsWith(extension)) files.push(entry.name);
  }

  return files.sort();
}

async function directoryEntries(
  sourceRoot: string,
  destinationRoot: string,
  extension?: string,
): Promise<SyncEntry[]> {
  return (await listFiles(sourceRoot, extension)).map((relativePath) => ({
    destination: path.join(destinationRoot, relativePath),
    source: path.join(sourceRoot, relativePath),
  }));
}

async function assertFileEqual(source: string, destination: string): Promise<void> {
  const [sourceBuffer, destinationBuffer] = await Promise.all([
    readFile(source),
    readFile(destination).catch(() => null),
  ]);
  if (!destinationBuffer || !sourceBuffer.equals(destinationBuffer)) {
    throw new Error(`[design-sync] stale file: ${path.relative(repoRoot, destination)}`);
  }
}

async function syncDirectory(
  sourceRoot: string,
  destinationRoot: string,
  extension: string,
  check: boolean,
): Promise<void> {
  const entries = await directoryEntries(sourceRoot, destinationRoot, extension);

  if (check) {
    const destinationFiles = await listFiles(destinationRoot, extension).catch(() => []);
    const expectedFiles = entries.map(({ destination }) =>
      path.relative(destinationRoot, destination),
    );
    if (destinationFiles.join('\n') !== expectedFiles.join('\n')) {
      throw new Error(
        `[design-sync] file set differs: ${path.relative(repoRoot, destinationRoot)}`,
      );
    }
    await Promise.all(
      entries.map(({ destination, source }) => assertFileEqual(source, destination)),
    );
    return;
  }

  await rm(destinationRoot, { recursive: true, force: true });
  for (const { destination, source } of entries) {
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
}

async function syncFiles(entries: SyncEntry[], check: boolean): Promise<void> {
  for (const { destination, source } of entries) {
    if (check) {
      await assertFileEqual(source, destination);
      continue;
    }
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
}

function extractInitializer(source: string, variableName: string): string {
  const sourceFile = ts.createSourceFile(
    'registry.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === variableName &&
        declaration.initializer
      ) {
        return declaration.initializer.getText(sourceFile);
      }
    }
  }

  throw new Error(`[design-sync] desktop registry is missing ${variableName}`);
}

function buildRoutingSource(source: string, commit: string): string {
  const modelPatterns = extractInitializer(source, 'MODEL_ICON_PATTERNS');
  const providerPatterns = extractInitializer(source, 'MODEL_TO_PROVIDER_PATTERNS');
  const aliases = extractInitializer(source, 'PROVIDER_ID_ALIASES');

  return `/**
 * Generated from desktop icon routing at commit ${commit}.
 * Do not edit directly. Run \`pnpm design:sync --desktop-root <path>\`.
 */

export const MODEL_ICON_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = ${modelPatterns};

export const MODEL_TO_PROVIDER_ICON_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = ${providerPatterns};

export const PROVIDER_ID_ALIASES: Readonly<Record<string, string>> = ${aliases};
`;
}

async function hashFiles(files: string[], baseRoot: string): Promise<string> {
  const hash = createHash('sha256');
  for (const file of files.sort()) {
    hash.update(path.relative(baseRoot, file));
    hash.update(await readFile(file));
  }
  return hash.digest('hex');
}

async function writeOrCheckText(
  destination: string,
  expected: string,
  check: boolean,
): Promise<void> {
  if (check) {
    const actual = await readFile(destination, 'utf8').catch(() => '');
    if (actual !== expected) {
      throw new Error(`[design-sync] stale file: ${path.relative(repoRoot, destination)}`);
    }
    return;
  }
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, expected, 'utf8');
}

async function main() {
  const { check, desktopRoot } = parseArguments();
  const desktopUi = path.join(desktopRoot, 'packages/ui');
  const packageJson = JSON.parse(await readFile(path.join(desktopUi, 'package.json'), 'utf8'));
  if (packageJson.name !== '@cherrystudio/ui') {
    throw new Error('[design-sync] --desktop-root does not contain the Cherry Studio UI package');
  }

  const trackedSources = [
    'packages/ui/src/styles',
    'packages/ui/scripts/theme-contract.ts',
    'packages/ui/icons',
    'packages/ui/src/components/icons/registry.ts',
  ];
  const dirty = run('git', ['status', '--porcelain', '--', ...trackedSources], desktopRoot);
  if (dirty) {
    throw new Error(`[design-sync] desktop design sources have uncommitted changes:\n${dirty}`);
  }

  const commit = run('git', ['rev-parse', 'HEAD'], desktopRoot);
  const desktopStyles = path.join(desktopUi, 'src/styles');
  await syncDirectory(
    path.join(desktopStyles, 'tokens'),
    path.join(stylesDestination, 'tokens'),
    '.css',
    check,
  );
  await syncFiles(
    ['contract.css', 'product.css', 'shadcn.css', 'theme-input.css', 'tokens.css'].map(
      (fileName) => ({
        destination: path.join(stylesDestination, fileName),
        source: path.join(desktopStyles, fileName),
      }),
    ),
    check,
  );
  await syncFiles(
    [
      {
        destination: path.join(packageRoot, 'scripts/theme-contract.ts'),
        source: path.join(desktopUi, 'scripts/theme-contract.ts'),
      },
    ],
    check,
  );

  const desktopIcons = path.join(desktopUi, 'icons');
  const mobileIcons = path.join(repoRoot, 'packages/ui/icons');
  for (const group of ['general', 'models', 'providers']) {
    await syncDirectory(
      path.join(desktopIcons, group),
      path.join(mobileIcons, group),
      '.svg',
      check,
    );
  }

  const desktopRegistryPath = path.join(desktopUi, 'src/components/icons/registry.ts');
  const desktopRegistry = await readFile(desktopRegistryPath, 'utf8');
  await writeOrCheckText(routingDestination, buildRoutingSource(desktopRegistry, commit), check);

  const styleFiles = [
    ...(await listFiles(path.join(desktopStyles, 'tokens'), '.css')).map((file) =>
      path.join(desktopStyles, 'tokens', file),
    ),
    ...['contract.css', 'product.css', 'shadcn.css', 'theme-input.css', 'tokens.css'].map((file) =>
      path.join(desktopStyles, file),
    ),
    path.join(desktopUi, 'scripts/theme-contract.ts'),
  ];
  const iconFiles = (await listFiles(desktopIcons, '.svg')).map((file) =>
    path.join(desktopIcons, file),
  );
  const manifest = `${JSON.stringify(
    {
      commit,
      repository: packageJson.repository?.url ?? 'https://github.com/CherryHQ/cherry-studio',
      schemaVersion: 1,
      sources: {
        iconRouting: await hashFiles([desktopRegistryPath], desktopRoot),
        icons: await hashFiles(iconFiles, desktopRoot),
        tokens: await hashFiles(styleFiles, desktopRoot),
      },
    },
    null,
    2,
  )}\n`;
  await writeOrCheckText(manifestPath, manifest, check);

  if (check) {
    const { assertNativeCssCurrent } = await import('./build-native-css');
    await assertNativeCssCurrent();
    run('pnpm', ['exec', 'tsx', 'packages/ui/src/scripts/check-icons.ts'], repoRoot);
  } else {
    const { writeNativeCss } = await import('./build-native-css');
    await writeNativeCss();
    run('pnpm', ['exec', 'tsx', 'packages/ui/src/scripts/generate-icons.ts'], repoRoot);
  }

  process.stdout.write(`Design sources ${check ? 'match' : 'synced from'} desktop ${commit}.\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
