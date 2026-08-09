import { readdir, readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import ts from 'typescript';

const DEFAULT_PACKAGE_ROOT = path.resolve(__dirname, '..');
const FORBIDDEN_PREFIXES = ['@/', '@shared', '@logger'] as const;
const FORBIDDEN_GLOBALS = new Set(['Buffer', '__dirname', '__filename', 'process']);
const NODE_BUILTINS = new Set(
  builtinModules.flatMap((specifier) => [specifier, specifier.replace(/^node:/, '')]),
);
const EXPECTED_EXPORTS = ['./messages', './provider', './runtime', './tools', './utils'];

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory()
        ? sourceFiles(entryPath)
        : Promise.resolve(entry.name.endsWith('.ts') ? [entryPath] : []);
    }),
  );
  return files.flat().sort();
}

function importedSpecifiers(source: string, file: string): string[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const imports: string[] = [];
  parsed.forEachChild((node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push(node.moduleSpecifier.text);
    }
  });
  return imports;
}

function referencedForbiddenGlobals(source: string, file: string): string[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const globals = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && FORBIDDEN_GLOBALS.has(node.text)) globals.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return [...globals].sort();
}

function isForbiddenImport(specifier: string): boolean {
  return (
    FORBIDDEN_PREFIXES.some(
      (prefix) =>
        specifier === prefix || specifier.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`),
    ) ||
    specifier === 'expo' ||
    specifier.startsWith('expo-') ||
    specifier === 'react-native' ||
    specifier.startsWith('react-native/') ||
    specifier.startsWith('node:') ||
    NODE_BUILTINS.has(specifier)
  );
}

export async function collectBoundaryViolations(
  packageRoot = DEFAULT_PACKAGE_ROOT,
): Promise<string[]> {
  const packageJson = JSON.parse(
    await readFile(path.join(packageRoot, 'package.json'), 'utf8'),
  ) as {
    exports?: Record<string, unknown>;
  };
  const actualExports = Object.keys(packageJson.exports ?? {}).sort();
  const violations: string[] = [];
  if (JSON.stringify(actualExports) !== JSON.stringify(EXPECTED_EXPORTS)) {
    violations.push(`package.json exports: ${actualExports.join(', ')}`);
  }

  const sourceRoot = path.join(packageRoot, 'src');
  for (const file of await sourceFiles(sourceRoot)) {
    const source = await readFile(file, 'utf8');
    const relativeFile = path.relative(packageRoot, file);
    for (const specifier of importedSpecifiers(source, file)) {
      if (isForbiddenImport(specifier)) violations.push(`${relativeFile} -> ${specifier}`);
    }
    for (const global of referencedForbiddenGlobals(source, file)) {
      violations.push(`${relativeFile} -> global:${global}`);
    }
  }

  return violations.sort();
}

export async function assertPackageBoundaries(packageRoot = DEFAULT_PACKAGE_ROOT): Promise<void> {
  const violations = await collectBoundaryViolations(packageRoot);
  if (violations.length > 0) {
    throw new Error(`Platform imports crossed the AI runtime boundary:\n${violations.join('\n')}`);
  }
}

async function main(): Promise<void> {
  await assertPackageBoundaries();
  console.log('AI runtime package boundaries are valid.');
}

const entrypoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (entrypoint === import.meta.url) void main();
