import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type Declaration = {
  name: string;
  source: string;
  value: string;
};

export type ThemeSources = {
  contract: string;
  product: string;
  radius: string;
  shadcn: string;
  tokens: string;
  tokensIndex: string;
  typography: string;
  vercel: string;
};

const customPropertyPattern = /^--[a-z0-9-]+$/;

export const packageRoot = path.resolve(import.meta.dirname, '..');
export const stylesDir = path.join(packageRoot, 'src/styles');

export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

export function extractDeclarations(source: string, sourceName: string): Declaration[] {
  const declarations = [
    ...stripComments(source).matchAll(/(?=(?:^|[;{])\s*(--[^\s:;{}]+)\s*:\s*([^;{}]+);)/g),
  ];

  return declarations.map((match) => {
    const name = match[1];
    if (!customPropertyPattern.test(name)) {
      throw new Error(`[design-tokens] ${sourceName} declares invalid custom property ${name}`);
    }

    return { name, source: sourceName, value: match[2].trim() };
  });
}

function findBlocks(source: string, marker: string): string[] {
  const blocks: string[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const markerIndex = source.indexOf(marker, cursor);
    if (markerIndex === -1) break;

    const braceIndex = source.indexOf('{', markerIndex + marker.length);
    if (braceIndex === -1) break;

    let depth = 1;
    let index = braceIndex + 1;
    while (index < source.length && depth > 0) {
      if (source[index] === '{') depth += 1;
      if (source[index] === '}') depth -= 1;
      index += 1;
    }

    if (depth !== 0) {
      throw new Error(`[design-tokens] unterminated ${marker} block`);
    }

    blocks.push(source.slice(braceIndex + 1, index - 1));
    cursor = index;
  }

  return blocks;
}

export function extractBlockDeclarations(
  source: string,
  marker: string,
  sourceName: string,
): Declaration[] {
  return findBlocks(stripComments(source), marker).flatMap((block) =>
    extractDeclarations(block, sourceName),
  );
}

export function extractImports(source: string): string[] {
  return [...stripComments(source).matchAll(/@import\s+(['"])([^'"]+)\1\s*;/g)].map(
    (match) => match[2],
  );
}

export function extractReferences(value: string): string[] {
  return [...value.matchAll(/var\(\s*(--[^\s,)]+)/g)].map((match) => match[1]);
}

export async function loadThemeSources(root = stylesDir): Promise<ThemeSources> {
  const tokensRoot = path.join(root, 'tokens');
  const read = (relativePath: string) => readFile(path.join(root, relativePath), 'utf8');

  const [contract, product, radius, shadcn, tokens, tokensIndex, typography, vercel] =
    await Promise.all([
      read('contract.css'),
      read('product.css'),
      read('tokens/radius.css'),
      read('shadcn.css'),
      read('tokens.css'),
      readFile(path.join(tokensRoot, 'index.css'), 'utf8'),
      read('tokens/typography.css'),
      read('tokens/colors/vercel.css'),
    ]);

  return {
    contract,
    product,
    radius,
    shadcn,
    tokens,
    tokensIndex,
    typography,
    vercel,
  };
}

function declarationMap(
  entries: Array<readonly [sourceName: string, source: string]>,
  marker: ':root' | '.dark',
): Map<string, Declaration> {
  const result = new Map<string, Declaration>();

  for (const [sourceName, source] of entries) {
    for (const declaration of extractBlockDeclarations(source, marker, sourceName)) {
      if (result.has(declaration.name)) {
        const previous = result.get(declaration.name);
        throw new Error(
          `[design-tokens] ${declaration.name} is declared by ${previous?.source} and ${sourceName}`,
        );
      }
      result.set(declaration.name, declaration);
    }
  }

  return result;
}

export function buildThemeModel(sources: ThemeSources) {
  // No colour source is static any more: every colour in the system flips with
  // the theme, so it belongs in the themed maps below.
  const staticEntries = [
    ['tokens/radius.css', sources.radius],
    ['tokens/typography.css', sources.typography],
  ] as const;
  const themedEntries = [
    // The palette comes first so the semantic layers below can reference it.
    ['tokens/colors/vercel.css', sources.vercel],
    ['shadcn.css', sources.shadcn],
    ['product.css', sources.product],
  ] as const;

  const staticDeclarations = declarationMap([...staticEntries], ':root');
  const lightDeclarations = declarationMap([...themedEntries], ':root');
  const darkOverrides = declarationMap([...themedEntries], '.dark');
  const darkDeclarations = new Map(lightDeclarations);

  for (const [name, declaration] of darkOverrides) {
    darkDeclarations.set(name, declaration);
  }

  return { darkDeclarations, lightDeclarations, staticDeclarations };
}

export function assertReferencesResolve(
  label: string,
  declarations: Map<string, Declaration>,
): void {
  for (const declaration of declarations.values()) {
    for (const reference of extractReferences(declaration.value)) {
      if (!declarations.has(reference)) {
        throw new Error(
          `[design-tokens] ${label} ${declaration.name} in ${declaration.source} references missing ${reference}`,
        );
      }
    }
  }
}

export function assertNoCycles(label: string, declarations: Map<string, Declaration>): void {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const stack: string[] = [];

  const visit = (name: string) => {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      const start = stack.indexOf(name);
      throw new Error(
        `[design-tokens] ${label} variable cycle: ${[...stack.slice(start), name].join(' -> ')}`,
      );
    }

    visiting.add(name);
    stack.push(name);
    const declaration = declarations.get(name);
    if (declaration) {
      for (const reference of extractReferences(declaration.value)) {
        if (declarations.has(reference)) visit(reference);
      }
    }
    stack.pop();
    visiting.delete(name);
    visited.add(name);
  };

  for (const name of declarations.keys()) visit(name);
}
