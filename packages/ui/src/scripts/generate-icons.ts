import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

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
const outputRoot = join(packageRoot, 'src/icons-png');

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

async function renderIcon(
  sourcePath: string,
  outputPath: string,
  foregroundColor: string,
  options: { trim?: boolean } = {},
) {
  const svg = normalizeCurrentColor(readFileSync(sourcePath, 'utf-8'), foregroundColor);
  const pipeline = sharp(Buffer.from(svg), { density: 192 });

  // Crop the transparent safe-area baked into the source SVG so the logo fills
  // the icon box instead of floating in whitespace (used for provider icons).
  if (options.trim) {
    pipeline.trim();
  }

  await pipeline
    .resize(imageSize, imageSize, {
      background: { alpha: 0, b: 0, g: 0, r: 0 },
      fit: 'contain',
    })
    .png({
      adaptiveFiltering: true,
      compressionLevel: 9,
    })
    .toFile(outputPath);
}

function buildRegistrySource(group: IconGroup, entries: IconEntry[]) {
  const { catalog, key: keyType, label, resolver } = registryNames[group];
  const resolverAlias =
    group === 'providers'
      ? '\nexport const resolveProviderIcon = resolveProviderAssetIcon;'
      : group === 'models'
        ? '\nexport const resolveModelIconAsset = resolveModelAssetIcon;'
        : '';
  const aliasImport =
    group === 'providers'
      ? "import { PROVIDER_ID_ALIASES } from '../provider-aliases';\n\n"
      : group === 'models'
        ? "import { MODEL_ID_ALIASES } from '../model-aliases';\n\n"
        : '';
  const aliasResolution =
    group === 'providers'
      ? `  const key = PROVIDER_ID_ALIASES[iconId] ?? iconId;
  const icons = ${catalog} as Record<string, IconPngSource>;

  return (
    icons[key as ${keyType}] ??
    icons[toKebabCase(key) as ${keyType}] ??
    icons[toCamelCase(key) as ${keyType}]
  );
`
      : group === 'models'
        ? `  const key = MODEL_ID_ALIASES[iconId] ?? iconId;
  const icons = ${catalog} as Record<string, IconPngSource>;

  return (
    icons[key as ${keyType}] ??
    icons[toKebabCase(key) as ${keyType}] ??
    icons[toCamelCase(key) as ${keyType}]
  );
`
        : `  const icons = ${catalog} as Record<string, IconPngSource>;

  return (
    icons[iconId as ${keyType}] ??
    icons[toKebabCase(iconId) as ${keyType}] ??
    icons[toCamelCase(iconId) as ${keyType}]
  );
`;
  const objectBody = entries
    .map(({ fileName, hasDark, key }) => {
      const darkSource = hasDark
        ? `require('./dark/${fileName}.png')`
        : `require('./light/${fileName}.png')`;

      return `  ${formatPropertyKey(key)}: {
    light: require('./light/${fileName}.png'),
    dark: ${darkSource},
  },`;
    })
    .join('\n');

  return `${writeGeneratedHeader(entries.length, label)}${aliasImport}import type { IconPngSource } from '../types';

export const ${catalog} = {
${objectBody}
} as const satisfies Record<string, IconPngSource>;

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

export function ${resolver}(iconId: string): IconPngSource | undefined {
  if (!iconId) return undefined;

${aliasResolution}}${resolverAlias}
`;
}

async function generateGroup(group: IconGroup) {
  const sourceDirs = groupedSourceDirs[group];
  const lightAssetDir = join(outputRoot, group, 'light');
  const darkAssetDir = join(outputRoot, group, 'dark');
  const files = readdirSync(sourceDirs.light)
    .filter((fileName) => fileName.endsWith('.svg'))
    .sort();
  const entries: IconEntry[] = [];
  // Provider icons get their transparent safe-area cropped so logos fill the box.
  const shouldTrim = group === 'providers';

  rmSync(join(outputRoot, group), { recursive: true, force: true });
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

    await renderIcon(lightSourcePath, join(lightAssetDir, `${assetName}.png`), foregroundLight, {
      trim: shouldTrim,
    });

    if (shouldRenderDark) {
      await renderIcon(
        hasDarkSource && darkSourcePath ? darkSourcePath : lightSourcePath,
        join(darkAssetDir, `${assetName}.png`),
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

  writeFileSync(join(outputRoot, group, 'index.ts'), buildRegistrySource(group, entries));
  console.log(`Generated ${entries.length} ${group} icon assets at ${imageSize}px`);
}

async function main() {
  const group = parseGroupArg();

  if (group === 'all' || group === 'general') await generateGroup('general');
  if (group === 'all' || group === 'models') await generateGroup('models');
  if (group === 'all' || group === 'providers') await generateGroup('providers');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
