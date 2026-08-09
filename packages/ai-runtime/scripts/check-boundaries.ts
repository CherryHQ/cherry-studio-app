import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import ts from 'typescript';

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOT = path.join(PACKAGE_ROOT, 'src');
const FORBIDDEN_IMPORTS = ['@/', '@shared/', '@logger', 'expo', 'react-native', 'node:'] as const;
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

async function main(): Promise<void> {
  const packageJson = JSON.parse(
    await readFile(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'),
  ) as {
    exports?: Record<string, unknown>;
  };
  const actualExports = Object.keys(packageJson.exports ?? {}).sort();
  if (JSON.stringify(actualExports) !== JSON.stringify(EXPECTED_EXPORTS)) {
    throw new Error(`Unexpected package exports: ${actualExports.join(', ')}`);
  }

  const violations: string[] = [];
  for (const file of await sourceFiles(SOURCE_ROOT)) {
    const source = await readFile(file, 'utf8');
    for (const specifier of importedSpecifiers(source, file)) {
      if (
        FORBIDDEN_IMPORTS.some((prefix) => specifier === prefix || specifier.startsWith(prefix))
      ) {
        violations.push(`${path.relative(PACKAGE_ROOT, file)} -> ${specifier}`);
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(`Platform imports crossed the AI runtime seam:\n${violations.join('\n')}`);
  }

  console.log('AI runtime package boundaries are valid.');
}

void main();
