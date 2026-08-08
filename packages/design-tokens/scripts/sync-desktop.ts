/**
 * Mirrors the desktop icon catalog into mobile.
 *
 * Despite living in the design-tokens package, this no longer touches a single
 * token: values *and* names are mobile-owned since the Vercel Brand Guidelines
 * fork (see the tombstones under src/styles). It stays here because
 * `desktop-sync-manifest.json` delegates its `design` fingerprint to
 * src/sync-manifest.json, which this script writes.
 */

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
const manifestPath = path.join(packageRoot, 'src/sync-manifest.json');
const routingDestination = path.join(repoRoot, 'packages/ui/src/icons/desktop-routing.ts');
const catalogOnlyProviderDestination = path.join(
  repoRoot,
  'packages/ui/src/scripts/catalog-only-provider-icons.generated.ts',
);

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

function extractJoinedDataUri(source: string, sourcePath: string): string {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const initializer = declaration.initializer;
      if (
        !initializer ||
        !ts.isCallExpression(initializer) ||
        !ts.isPropertyAccessExpression(initializer.expression) ||
        initializer.expression.name.text !== 'join' ||
        !ts.isArrayLiteralExpression(initializer.expression.expression)
      ) {
        continue;
      }

      const parts = initializer.expression.expression.elements;
      if (!parts.every(ts.isStringLiteralLike)) continue;
      const value = parts.map((part) => (ts.isStringLiteralLike(part) ? part.text : '')).join('');
      if (value.startsWith('data:image/png;base64,')) return value;
    }
  }

  throw new Error(`[design-sync] catalog-only provider is missing an embedded PNG: ${sourcePath}`);
}

function assertRadeonCloudVisualContract(source: string, sourcePath: string): void {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const tags = new Map<string, Map<string, string>>();

  const visit = (node: ts.Node): void => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tagName = opening.tagName.getText(sourceFile);
      if (tagName === 'svg' || tagName === 'rect' || tagName === 'image') {
        const attributes = new Map<string, string>();
        for (const property of opening.attributes.properties) {
          if (!ts.isJsxAttribute(property) || !property.initializer) continue;
          const name = property.name.getText(sourceFile);
          if (ts.isStringLiteral(property.initializer)) {
            attributes.set(name, property.initializer.text);
            continue;
          }
          if (!ts.isJsxExpression(property.initializer)) continue;
          const expression = property.initializer.expression;
          if (expression && (ts.isNumericLiteral(expression) || ts.isStringLiteral(expression))) {
            attributes.set(name, expression.text);
          }
        }
        tags.set(tagName, attributes);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  const expected = {
    image: { height: '22', preserveAspectRatio: 'xMidYMid meet', width: '92', x: '14', y: '49' },
    rect: { fill: '#fff', height: '120', rx: '24', width: '120' },
    svg: { viewBox: '0 0 120 120' },
  } as const;
  for (const [tagName, attributes] of Object.entries(expected)) {
    const actual = tags.get(tagName);
    for (const [name, value] of Object.entries(attributes)) {
      if (actual?.get(name) !== value) {
        throw new Error(
          `[design-sync] Radeon Cloud ${tagName}.${name} changed; update the explicit mobile adapter`,
        );
      }
    }
  }
}

async function buildCatalogOnlyProviderSource(
  desktopRoot: string,
  commit: string,
): Promise<{ source: string; sourcePath: string }> {
  const sourcePath = 'packages/ui/src/components/icons/providers/radeon-cloud/light.tsx';
  const absolutePath = path.join(desktopRoot, sourcePath);
  const source = await readFile(absolutePath, 'utf8');
  assertRadeonCloudVisualContract(source, sourcePath);
  const dataUri = extractJoinedDataUri(source, sourcePath);
  const decodedRaster = Buffer.from(dataUri.slice(dataUri.indexOf(',') + 1), 'base64');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#fff" rx="24"/><image href="${dataUri}" x="14" y="49" width="92" height="22" preserveAspectRatio="xMidYMid meet"/></svg>`;
  const provenance = {
    decodedRasterSha256: createHash('sha256').update(decodedRaster).digest('hex'),
    desktopCommit: commit,
    desktopSourcePath: sourcePath,
    desktopSourceSha256: await hashFiles([absolutePath], desktopRoot),
  };
  const svgLiteral = `'${svg.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

  return {
    source: `/**
 * Generated by the desktop design sync. Do not edit directly.
 */

export const CATALOG_ONLY_PROVIDER_ICONS = {
  'radeon-cloud': {
    provenance: {
      decodedRasterSha256: '${provenance.decodedRasterSha256}',
      desktopCommit: '${provenance.desktopCommit}',
      desktopSourcePath: '${provenance.desktopSourcePath}',
      desktopSourceSha256: '${provenance.desktopSourceSha256}',
    },
    svg: ${svgLiteral},
  },
} as const;
`,
    sourcePath,
  };
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

  // Only icons. Neither `packages/ui/src/styles` nor `scripts/theme-contract.ts`
  // is tracked: mobile owns the token values *and* their names outright, so an
  // unrelated desktop style edit must not report this sync as dirty.
  const trackedSources = [
    'packages/ui/icons',
    'packages/ui/src/components/icons/registry.ts',
    'packages/ui/src/components/icons/providers/radeon-cloud',
  ];
  const dirty = run('git', ['status', '--porcelain', '--', ...trackedSources], desktopRoot);
  if (dirty) {
    throw new Error(`[design-sync] desktop icon sources have uncommitted changes:\n${dirty}`);
  }

  const commit = run('git', ['rev-parse', 'HEAD'], desktopRoot);
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
  const catalogOnlyProvider = await buildCatalogOnlyProviderSource(desktopRoot, commit);
  await writeOrCheckText(catalogOnlyProviderDestination, catalogOnlyProvider.source, check);

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
        catalogOnlyIcons: await hashFiles(
          [path.join(desktopRoot, catalogOnlyProvider.sourcePath)],
          desktopRoot,
        ),
        icons: await hashFiles(iconFiles, desktopRoot),
      },
    },
    null,
    2,
  )}\n`;
  await writeOrCheckText(manifestPath, manifest, check);

  // native.css is not rebuilt here — it derives purely from local token sources,
  // which this sync no longer touches. `pnpm design:build` / `design:check` own it.
  const iconScript = check ? 'check-icons.ts' : 'generate-icons.ts';
  run('pnpm', ['exec', 'tsx', `packages/ui/src/scripts/${iconScript}`], repoRoot);

  process.stdout.write(`Icon sources ${check ? 'match' : 'synced from'} desktop ${commit}.\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
