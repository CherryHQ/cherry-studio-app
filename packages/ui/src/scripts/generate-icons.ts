import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { CATALOG_ONLY_PROVIDER_ICONS } from './catalog-only-provider-icons.generated';

type IconGroup = 'general' | 'models' | 'providers';

type IconEntry = {
  fileName: string;
  hasDark: boolean;
  key: string;
};

const imageSize = 72;
const foregroundLight = 'rgba(0, 0, 0, 0.9)';
const foregroundDark = 'rgba(255, 255, 255, 0.9)';
const packageRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const sourceRoot = join(packageRoot, 'icons');
const outputRoot = join(packageRoot, 'src/icons-webp');

const groupedSourceDirs: Record<IconGroup, { dark?: string; light: string }> = {
  general: {
    light: join(sourceRoot, 'general'),
  },
  models: {
    light: join(sourceRoot, 'models/light'),
    dark: join(sourceRoot, 'models/dark'),
  },
  providers: {
    light: join(sourceRoot, 'providers/light'),
    dark: join(sourceRoot, 'providers/dark'),
  },
};

const registryNames = {
  general: {
    catalog: 'GENERAL_ICONS',
    key: 'GeneralIconKey',
    label: 'general',
    resolver: 'resolveGeneralIcon',
  },
  models: {
    catalog: 'MODEL_ICONS',
    key: 'ModelIconKey',
    label: 'model',
    resolver: 'resolveModelAssetIcon',
  },
  providers: {
    catalog: 'PROVIDER_ICONS',
    key: 'ProviderIconKey',
    label: 'provider',
    resolver: 'resolveProviderAssetIcon',
  },
} as const satisfies Record<
  IconGroup,
  {
    catalog: string;
    key: string;
    label: string;
    resolver: string;
  }
>;

function parseGroupArg(): IconGroup | 'all' {
  const arg = process.argv.find((item) => item.startsWith('--type='));
  if (!arg) return 'all';

  const value = arg.split('=')[1];
  if (value === 'general' || value === 'models' || value === 'providers') return value;

  throw new Error(`Invalid --type value: ${value}. Use general, models, or providers.`);
}

function formatPropertyKey(key: string) {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) return key;

  return `'${key.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function writeGeneratedHeader(total: number, label: string) {
  return `/**
 * Auto-generated ${label} icon registry
 * Do not edit manually.
 *
 * Total icons: ${total}
 */

`;
}

function normalizeCurrentColor(svg: string, color: string) {
  return svg.replace(/currentColor/g, color);
}

async function renderSvg(
  svg: string,
  outputPath: string,
  foregroundColor: string,
  options: { trim?: boolean } = {},
) {
  const normalizedSvg = normalizeCurrentColor(svg, foregroundColor);
  const pipeline = sharp(Buffer.from(normalizedSvg), { density: 192 });

  // Crop transparent safe-area without treating a full-bleed brand color as
  // removable background when the SVG's top-left pixel is opaque.
  if (options.trim) {
    pipeline.trim({ background: { alpha: 0, b: 0, g: 0, r: 0 } });
  }

  await pipeline
    .resize(imageSize, imageSize, {
      background: { alpha: 0, b: 0, g: 0, r: 0 },
      fit: 'contain',
    })
    .webp({
      effort: 6,
      lossless: true,
    })
    .toFile(outputPath);
}

async function renderIcon(
  sourcePath: string,
  outputPath: string,
  foregroundColor: string,
  options: { trim?: boolean } = {},
) {
  await renderSvg(readFileSync(sourcePath, 'utf-8'), outputPath, foregroundColor, options);
}

function buildRegistrySource(group: IconGroup, entries: IconEntry[]) {
  const { catalog, key: keyType, label, resolver } = registryNames[group];
  const resolverAlias =
    group === 'providers'
      ? `
export function resolveProviderIcon(iconId: string): IconSource | undefined {
  if (iconId === 'opencode') return resolveGeneralIcon('open-code');

  return resolveProviderAssetIcon(iconId);
}`
      : group === 'models'
        ? '\nexport const resolveModelIconAsset = resolveModelAssetIcon;'
        : '';
  const aliasImport =
    group === 'providers'
      ? "import { resolveGeneralIcon } from '../general';\nimport { PROVIDER_ID_ALIASES } from '../provider-aliases';\n\n"
      : group === 'models'
        ? "import { MODEL_ID_ALIASES } from '../model-aliases';\n\n"
        : '';
  const aliasResolution =
    group === 'providers'
      ? `  const icons = ${catalog} as Record<string, IconSource>;
  const key = PROVIDER_ID_ALIASES[iconId] ?? iconId;

  return (
    icons[key as ${keyType}] ??
    icons[toKebabCase(key) as ${keyType}] ??
    icons[toCamelCase(key) as ${keyType}]
  );
`
      : group === 'models'
        ? `  const key = MODEL_ID_ALIASES[iconId] ?? iconId;
  const icons = ${catalog} as Record<string, IconSource>;

  return (
    icons[key as ${keyType}] ??
    icons[toKebabCase(key) as ${keyType}] ??
    icons[toCamelCase(key) as ${keyType}]
  );
`
        : `  const icons = ${catalog} as Record<string, IconSource>;

  return (
    icons[iconId as ${keyType}] ??
    icons[toKebabCase(iconId) as ${keyType}] ??
    icons[toCamelCase(iconId) as ${keyType}]
  );
`;
  const objectBody = entries
    .map(({ fileName, hasDark, key }) => {
      const darkSource = hasDark
        ? `require('./dark/${fileName}.webp')`
        : `require('./light/${fileName}.webp')`;

      return `  ${formatPropertyKey(key)}: {
    light: require('./light/${fileName}.webp'),
    dark: ${darkSource},
  },`;
    })
    .join('\n');

  return `${writeGeneratedHeader(entries.length, label)}${aliasImport}import type { IconSource } from '../types';

export const ${catalog} = {
${objectBody}
} as const satisfies Record<string, IconSource>;

export type ${keyType} = keyof typeof ${catalog};

function toCamelCase(iconId: string) {
  const parts = iconId.split('-');

  return (
    parts[0] +
    parts
      .slice(1)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')
  );
}

function toKebabCase(iconId: string) {
  return iconId
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

export function ${resolver}(iconId: string): IconSource | undefined {
  if (!iconId) return undefined;

${aliasResolution}}${resolverAlias}
`;
}

export async function generateGroup(group: IconGroup, targetRoot = outputRoot, log = true) {
  const sourceDirs = groupedSourceDirs[group];
  const lightAssetDir = join(targetRoot, group, 'light');
  const darkAssetDir = join(targetRoot, group, 'dark');
  const files = readdirSync(sourceDirs.light)
    .filter((fileName) => fileName.endsWith('.svg'))
    .sort();
  const entries: IconEntry[] = [];
  // Provider icons get their transparent safe-area cropped so logos fill the box.
  const shouldTrim = group === 'providers';

  rmSync(join(targetRoot, group), { recursive: true, force: true });
  mkdirSync(lightAssetDir, { recursive: true });
  mkdirSync(darkAssetDir, { recursive: true });

  for (const fileName of files) {
    const assetName = fileName.replace(/\.svg$/, '');
    const lightSourcePath = join(sourceDirs.light, fileName);
    const darkSourcePath = sourceDirs.dark ? join(sourceDirs.dark, fileName) : null;
    const lightSvg = readFileSync(lightSourcePath, 'utf-8');
    const hasCurrentColor = /currentColor/.test(lightSvg);
    const hasDarkSource = Boolean(darkSourcePath && existsSync(darkSourcePath));
    const shouldRenderDark = hasDarkSource || hasCurrentColor;

    await renderIcon(lightSourcePath, join(lightAssetDir, `${assetName}.webp`), foregroundLight, {
      trim: shouldTrim,
    });

    if (shouldRenderDark) {
      await renderIcon(
        hasDarkSource && darkSourcePath ? darkSourcePath : lightSourcePath,
        join(darkAssetDir, `${assetName}.webp`),
        foregroundDark,
        { trim: shouldTrim },
      );
    }

    entries.push({
      fileName: assetName,
      hasDark: shouldRenderDark,
      key: assetName,
    });
  }

  if (group === 'providers') {
    const catalogOnlyManifest = [];
    for (const [assetName, source] of Object.entries(CATALOG_ONLY_PROVIDER_ICONS)) {
      const outputPath = join(lightAssetDir, `${assetName}.webp`);
      await renderSvg(source.svg, outputPath, foregroundLight, { trim: true });
      const outputSha256 = createHash('sha256').update(readFileSync(outputPath)).digest('hex');
      entries.push({ fileName: assetName, hasDark: false, key: assetName });
      catalogOnlyManifest.push({
        id: assetName,
        outputPath: `light/${assetName}.webp`,
        outputSha256,
        ...source.provenance,
      });
    }
    writeFileSync(
      join(targetRoot, group, 'catalog-only-manifest.json'),
      `${JSON.stringify(catalogOnlyManifest, null, 2)}\n`,
    );
    entries.sort((left, right) => left.key.localeCompare(right.key));
  }

  writeFileSync(join(targetRoot, group, 'index.ts'), buildRegistrySource(group, entries));
  if (log) console.log(`Generated ${entries.length} ${group} icon assets at ${imageSize}px`);
}

function listRelativeFiles(root: string, relativeRoot = ''): string[] {
  const absoluteRoot = join(root, relativeRoot);

  return readdirSync(absoluteRoot, { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = join(relativeRoot, entry.name);
      return entry.isDirectory() ? listRelativeFiles(root, relativePath) : [relativePath];
    })
    .sort();
}

function assertDirectoriesEqual(expectedRoot: string, actualRoot: string) {
  const expectedFiles = listRelativeFiles(expectedRoot);
  const actualFiles = listRelativeFiles(actualRoot);

  if (expectedFiles.join('\n') !== actualFiles.join('\n')) {
    throw new Error('Generated icon file set is stale; run pnpm ui:icons:generate');
  }

  for (const relativePath of expectedFiles) {
    if (
      !readFileSync(join(expectedRoot, relativePath)).equals(
        readFileSync(join(actualRoot, relativePath)),
      )
    ) {
      throw new Error(`Generated icon is stale: ${relativePath}`);
    }
  }
}

async function assertWebpAssetsValid(root: string) {
  const webpFiles = listRelativeFiles(root).filter((fileName) => fileName.endsWith('.webp'));

  for (const relativePath of webpFiles) {
    const image = sharp(join(root, relativePath));
    const [metadata, stats] = await Promise.all([image.metadata(), image.stats()]);
    if (metadata.format !== 'webp') {
      throw new Error(`Generated icon must be WebP: ${relativePath}`);
    }
    if (metadata.width !== imageSize || metadata.height !== imageSize) {
      throw new Error(`Generated icon must be ${imageSize}x${imageSize}: ${relativePath}`);
    }

    const alpha = metadata.hasAlpha ? stats.channels.at(-1) : undefined;
    if (alpha && alpha.max === 0) {
      throw new Error(`Generated icon is fully transparent: ${relativePath}`);
    }
  }
}

export async function checkGeneratedIcons() {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'cherry-icons-'));

  try {
    for (const group of ['general', 'models', 'providers'] as const) {
      await generateGroup(group, temporaryRoot, false);
      assertDirectoriesEqual(join(temporaryRoot, group), join(outputRoot, group));
      await assertWebpAssetsValid(join(outputRoot, group));
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

async function main() {
  if (process.argv.includes('--check')) {
    await checkGeneratedIcons();
    console.log('Generated icon assets are current.');
    return;
  }

  const group = parseGroupArg();

  if (group === 'all' || group === 'general') await generateGroup('general');
  if (group === 'all' || group === 'models') await generateGroup('models');
  if (group === 'all' || group === 'providers') await generateGroup('providers');
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
