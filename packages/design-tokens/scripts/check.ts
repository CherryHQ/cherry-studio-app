import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { assertNativeCssCurrent } from './build-native-css';
import {
  assertNoCycles,
  assertReferencesResolve,
  buildThemeModel,
  extractBlockDeclarations,
  extractImports,
  loadThemeSources,
  stylesDir,
} from './css-contract';
import {
  CHERRY_PRODUCT_COLOR_TOKENS,
  CHERRY_PRODUCT_VARIABLE_TOKENS,
  SHADCN_PUBLIC_COLOR_TOKENS,
  SHADCN_VARIABLE_TOKENS,
} from './theme-contract';

function assertEqual(label: string, actual: readonly string[], expected: readonly string[]): void {
  if (
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error(
      `[design-tokens] ${label} mismatch\nactual: ${actual.join(', ')}\nexpected: ${expected.join(', ')}`,
    );
  }
}

function assertRequired(names: Set<string>, required: readonly string[], prefix: string): void {
  const missing = required.map((name) => `${prefix}${name}`).filter((name) => !names.has(name));
  if (missing.length > 0) {
    throw new Error(`[design-tokens] missing contract variables: ${missing.join(', ')}`);
  }
}

export async function checkDesignTokens(): Promise<void> {
  const sources = await loadThemeSources();
  assertEqual('tokens.css imports', extractImports(sources.tokens), ['./tokens/index.css']);
  assertEqual('tokens/index.css imports', extractImports(sources.tokensIndex), [
    './colors/vercel.css',
    './radius.css',
    './typography.css',
  ]);
  assertEqual('contract.css imports', extractImports(sources.contract), [
    './tokens.css',
    './shadcn.css',
    './product.css',
  ]);

  const { darkDeclarations, lightDeclarations, staticDeclarations } = buildThemeModel(sources);
  const lightResolved = new Map([...staticDeclarations, ...lightDeclarations]);
  const darkResolved = new Map([...staticDeclarations, ...darkDeclarations]);
  assertReferencesResolve('light', lightResolved);
  assertReferencesResolve('dark', darkResolved);
  assertNoCycles('light', lightResolved);
  assertNoCycles('dark', darkResolved);

  const lightNames = new Set(lightDeclarations.keys());
  assertRequired(lightNames, SHADCN_VARIABLE_TOKENS, '--');
  assertRequired(lightNames, CHERRY_PRODUCT_VARIABLE_TOKENS, '--');

  await assertNativeCssCurrent();
  const nativeCss = await readFile(path.join(stylesDir, 'native.css'), 'utf8');
  if (!nativeCss.includes('@theme inline static {')) {
    throw new Error('[design-tokens] native adapter colors must be statically available to JS');
  }
  const nativeLightNames = extractBlockDeclarations(nativeCss, '@variant light', 'native.css').map(
    ({ name }) => name,
  );
  const nativeDarkNames = extractBlockDeclarations(nativeCss, '@variant dark', 'native.css').map(
    ({ name }) => name,
  );
  assertEqual('native light/dark variables', nativeDarkNames, nativeLightNames);

  // Every `--color-*` the adapter emits must be a public contract name. This
  // used to skip `var(--cs-*)` targets, back when the raw palettes were exposed
  // as utilities too; dropping that filter turns the assertion into the stronger
  // claim that no palette step can leak back into a className.
  const expectedPublicColors = new Set([
    ...SHADCN_PUBLIC_COLOR_TOKENS,
    ...CHERRY_PRODUCT_COLOR_TOKENS,
  ]);
  const semanticMappings = [
    ...nativeCss.matchAll(/^\s*--color-([a-z0-9-]+):\s*var\(--([a-z0-9-]+)\);$/gm),
  ].map((match) => match[1]);
  assertEqual('public semantic colors', semanticMappings, [...expectedPublicColors]);
}

void checkDesignTokens()
  .then(() => process.stdout.write('Design-token contract is current.\n'))
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
