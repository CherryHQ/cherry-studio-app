import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { packageRoot } from './css-contract';

const repoRoot = path.resolve(packageRoot, '../..');

/** Everything that consumes the theme: the app, CherryUI, and its Storybook pages. */
const themeConsumerRoots = ['src', 'packages/ui/src', 'packages/ui/stories'];

/**
 * Production code only. Stories are excluded because they document component
 * APIs (a toast icon colour, a composer link colour) rather than ship UI, and
 * tests because they assert rendered colour values.
 */
const colorLiteralRoots = ['src', 'packages/ui/src'];

function isTestFile(relativePath: string): boolean {
  return /(?:^|\/)__tests__\//.test(relativePath) || /\.test\.tsx?$/.test(relativePath);
}

/**
 * Colour literals allowed outside the token contract, one entry per file with
 * the DESIGN.md exemption it falls under. A new literal means either replacing
 * it with a token or registering it here with its case — never a bare commit.
 * Entries that no longer match anything fail the check so the registry cannot
 * go stale.
 */
const colorLiteralAllowlist: Record<string, string> = {
  'packages/ui/src/background-activity/background-activity.ios.tsx':
    'outside the render tree: Live Activity UI never passes through uniwind',
  'packages/ui/src/background-activity/background-activity.preview.tsx':
    'outside the render tree: on-device preview of the Live Activity, mirrors its literals',
  'packages/ui/src/components/loading/image-generation-loader.tsx':
    'Skia fallback inks for the frame where CSS variables are not yet resolved',
  'packages/ui/src/components/markdown-text/utils/syntax-colors.ts':
    'artwork: syntax-highlight palettes are curated per-theme sets, not theme roles',
  'packages/ui/src/scripts/catalog-only-provider-icons.generated.ts':
    'artwork: generated provider icon SVGs',
  'packages/ui/src/scripts/generate-icons.ts': 'build script, outside the render tree',
  'src/frontend/components/avatar/utils/brandAvatarStyles.ts':
    'upstream of the tokens: picks ink by luminance, its output is the colour decision',
  'src/frontend/components/startup/StartupCover.tsx':
    'outside the theme runtime: paints before the CSS variable tree exists',
  'src/frontend/features/onboarding/logoDraw/utils/logoPalette.ts':
    'artwork: the logo colours encode relationships with each other, not roles',
  'src/shared/core/logger/LoggerService.ts':
    'outside the render tree: `%c` console styles never pass through uniwind',
};

const forbiddenPatterns = [
  /\b(?:bg|border|text)-accent(?:[/'"\s]|$)/,
  // `muted` alone is HeroUI's secondary-text role; only `muted-foreground` is a
  // Cherry utility. The lookahead lets the latter through.
  /\b(?:bg|border|text)-muted(?![a-z-])/,
  /accent-muted(?!-foreground)/,
  /foreground-(?:secondary|muted)/,
  /import\s*\{[^}]*\buseThemeColor\b[^}]*\}\s*from\s*['"]heroui-native\/hooks['"]/s,
];

const colorLiteralPattern = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|color-mix)\(/;

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

/**
 * Comments may cite hex values (contrast measurements, issue numbers); only
 * code counts. Line comments are stripped only when preceded by line start or
 * whitespace so `http://` inside a string survives.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

async function main() {
  const retiredViolations: string[] = [];
  for (const root of themeConsumerRoots) {
    for (const file of await listTypeScriptFiles(path.join(repoRoot, root))) {
      const source = await readFile(file, 'utf8');
      if (forbiddenPatterns.some((pattern) => pattern.test(source))) {
        retiredViolations.push(path.relative(repoRoot, file));
      }
    }
  }
  if (retiredViolations.length > 0) {
    throw new Error(
      `[design-tokens] app source uses retired theme utilities:\n${retiredViolations.join('\n')}`,
    );
  }

  const literalViolations: string[] = [];
  const usedExemptions = new Set<string>();
  for (const root of colorLiteralRoots) {
    for (const file of await listTypeScriptFiles(path.join(repoRoot, root))) {
      const relativePath = path.relative(repoRoot, file);
      if (isTestFile(relativePath)) continue;
      const source = stripComments(await readFile(file, 'utf8'));
      if (!colorLiteralPattern.test(source)) continue;
      if (relativePath in colorLiteralAllowlist) {
        usedExemptions.add(relativePath);
      } else {
        literalViolations.push(relativePath);
      }
    }
  }
  if (literalViolations.length > 0) {
    throw new Error(
      `[design-tokens] colour literals outside the token contract (fix, or register a DESIGN.md exemption in check-app-theme.ts):\n${literalViolations.join('\n')}`,
    );
  }
  const staleExemptions = Object.keys(colorLiteralAllowlist).filter(
    (file) => !usedExemptions.has(file),
  );
  if (staleExemptions.length > 0) {
    throw new Error(
      `[design-tokens] colour-literal allowlist entries no longer match anything:\n${staleExemptions.join('\n')}`,
    );
  }

  const globalCss = await readFile(path.join(repoRoot, 'src/frontend/styles/global.css'), 'utf8');
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
