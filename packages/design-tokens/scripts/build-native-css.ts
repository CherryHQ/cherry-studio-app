import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildThemeModel, type Declaration, loadThemeSources, stylesDir } from './css-contract';
import { CHERRY_PRODUCT_COLOR_TOKENS, SHADCN_PUBLIC_COLOR_TOKENS } from './theme-contract';

const outputPath = path.join(stylesDir, 'native.css');

// The whole `rounded-*` ladder is derived from the one authored step,
// `--radius` (8px, VBG's only body radius). The hairline steps below it are not
// multiples of anything and are authored in tokens/radius.css, whose names now
// sit directly in Tailwind's `--radius-*` namespace and so need no line here.
const radiusLines = [
  '--radius-sm: calc(var(--radius) * 0.6);',
  '--radius-md: calc(var(--radius) * 0.8);',
  '--radius-lg: var(--radius);',
  '--radius-xl: calc(var(--radius) * 1.4);',
  '--radius-2xl: calc(var(--radius) * 1.8);',
  '--radius-3xl: calc(var(--radius) * 2.2);',
  '--radius-4xl: calc(var(--radius) * 2.6);',
  '--radius-full: 9999px;',
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
  // Only the semantic contract becomes a Tailwind colour. The palette behind it
  // deliberately stays out: a `bg-gray-100` would sit in the same name family as
  // the Tailwind steps VBG does not define (`bg-gray-50`, `bg-gray-500`, …),
  // which are static defaults rather than theme-flipping tokens — one class
  // name, two provenances. Storybook reads the ramps through `useCSSVariable`
  // instead, which needs no adapter entry.
  // HeroUI-reserved names (`muted`, `accent`, `accent-foreground`) are excluded:
  // the app host in global.css maps their `--color-*` forms to HeroUI's meaning,
  // so emitting them here would give one utility name two owners.
  const publicColors = unique([...SHADCN_PUBLIC_COLOR_TOKENS, ...CHERRY_PRODUCT_COLOR_TOKENS]);
  // Font weights need no adapter line either: `tokens/typography.css` already
  // authors `--font-weight-bold` under its final Tailwind name.
  const adapterLines = [
    ...publicColors.map((name) => `--color-${name}: var(--${name});`),
    ...radiusLines,
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
