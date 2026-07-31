import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { packageRoot } from './css-contract';

const repoRoot = path.resolve(packageRoot, '../..');
const sourceRoot = path.join(repoRoot, 'src');

async function listTypeScriptFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listTypeScriptFiles(absolutePath)));
    } else if (/\.tsx?$/.test(entry.name)) {
      files.push(absolutePath);
    }
  }

  return files;
}

async function main() {
  const forbiddenPatterns = [
    /\b(?:bg|border|text)-accent(?:[/'"\s]|$)/,
    /accent-muted(?!-foreground)/,
    /foreground-(?:secondary|muted)/,
    /import\s*\{[^}]*\buseThemeColor\b[^}]*\}\s*from\s*['"]heroui-native\/hooks['"]/s,
  ];
  const violations: string[] = [];

  for (const file of await listTypeScriptFiles(sourceRoot)) {
    const source = await readFile(file, 'utf8');
    if (forbiddenPatterns.some((pattern) => pattern.test(source))) {
      violations.push(path.relative(repoRoot, file));
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `[design-tokens] app source uses retired theme utilities:\n${violations.join('\n')}`,
    );
  }

  const globalCss = await readFile(path.join(sourceRoot, 'frontend/styles/global.css'), 'utf8');
  if (!globalCss.includes('@theme static {')) {
    throw new Error('[design-tokens] HeroUI host colors must be statically available to JS');
  }
  for (const declaration of [
    '--color-accent: var(--primary);',
    '--color-accent-foreground: var(--primary-foreground);',
    '--color-muted: var(--muted-foreground);',
  ]) {
    if (!globalCss.includes(declaration)) {
      throw new Error(`[design-tokens] missing HeroUI host mapping: ${declaration}`);
    }
  }

  const workspace = await readFile(path.join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
  if (/heroui-native@[^:]+:\s+patches\//.test(workspace)) {
    throw new Error(
      '[design-tokens] HeroUI must be adapted by the app host, not a dependency patch',
    );
  }

  process.stdout.write('App theme migration is current.\n');
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
