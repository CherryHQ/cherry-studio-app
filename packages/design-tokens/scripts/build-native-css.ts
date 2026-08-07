import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  buildThemeModel,
  type Declaration,
  extractDeclarations,
  loadThemeSources,
  stylesDir,
} from './css-contract';
import { CHERRY_PRODUCT_COLOR_TOKENS, SHADCN_COLOR_TOKENS } from './theme-contract';

const outputPath = path.join(stylesDir, 'native.css');

const radiusLines = [
  '--radius-4xs: var(--cs-radius-4xs);',
  '--radius-3xs: var(--cs-radius-3xs);',
  '--radius-2xs: var(--cs-radius-2xs);',
  '--radius-xs: var(--cs-radius-xs);',
  '--radius-sm: calc(var(--radius) * 0.6);',
  '--radius-md: calc(var(--radius) * 0.8);',
  '--radius-lg: var(--radius);',
  '--radius-xl: calc(var(--radius) * 1.4);',
  '--radius-2xl: calc(var(--radius) * 1.8);',
  '--radius-3xl: calc(var(--radius) * 2.2);',
  '--radius-4xl: calc(var(--radius) * 2.6);',
  '--radius-full: var(--cs-radius-round);',
  '--radius-round: var(--cs-radius-round);',
];

function renderDeclarations(declarations: Iterable<Declaration>, indent: string): string {
  return [...declarations].map(({ name, value }) => `${indent}${name}: ${value};`).join('\n');
}

function renderLines(lines: string[], indent = '  '): string {
  return lines.map((line) => `${indent}${line}`).join('\n');
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export async function buildNativeCss(): Promise<string> {
  const sources = await loadThemeSources();
  const { darkDeclarations, lightDeclarations, staticDeclarations } = buildThemeModel(sources);
  const typographyNames = extractDeclarations(sources.typography, 'typography.css').map(
    ({ name }) => name.replace(/^--cs-/, ''),
  );
  // Only the semantic contract becomes a Tailwind colour. The palette behind it
  // deliberately stays out: a `bg-gray-100` would sit in the same name family as
  // the Tailwind steps VBG does not define (`bg-gray-50`, `bg-gray-500`, …),
  // which are static defaults rather than theme-flipping tokens — one class
  // name, two provenances. Storybook reads the ramps through `useCSSVariable`
  // instead, which needs no adapter entry.
  const publicColors = unique([...SHADCN_COLOR_TOKENS, ...CHERRY_PRODUCT_COLOR_TOKENS]);
  const adapterLines = [
    ...publicColors.map((name) => `--color-${name}: var(--${name});`),
    ...radiusLines,
    ...typographyNames.map((name) => `--${name}: var(--cs-${name});`),
  ];

  return `/**
 * Generated from the token sources in this package's src/styles.
 * Do not edit directly. Run \`pnpm design:build\` after changing them.
 *
 * Both the token values (Vercel Brand Guidelines) and their names are
 * mobile-owned; nothing here is mirrored from desktop.
 */

@theme {
${renderDeclarations(staticDeclarations.values(), '  ')}
}

@theme inline static {
${renderLines(adapterLines)}
}

@layer theme {
  :root {
    @variant light {
${renderDeclarations(lightDeclarations.values(), '      ')}
    }

    @variant dark {
${renderDeclarations(darkDeclarations.values(), '      ')}
    }
  }
}
`;
}

export async function writeNativeCss(): Promise<void> {
  await writeFile(outputPath, await buildNativeCss(), 'utf8');
}

export async function assertNativeCssCurrent(): Promise<void> {
  const [actual, expected] = await Promise.all([readFile(outputPath, 'utf8'), buildNativeCss()]);
  if (actual !== expected) {
    throw new Error('[design-tokens] native.css is stale; run pnpm design:build');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  void writeNativeCss().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
