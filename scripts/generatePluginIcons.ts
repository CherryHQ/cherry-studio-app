import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import opticalScales from '../assets/plugins/optical-scales.json';
import {
  buildThemeModel,
  type Declaration,
  extractDeclarations,
  loadThemeSources,
  stylesDir,
} from '../packages/design-tokens/scripts/css-contract';

const ASSET_DIR = path.resolve(import.meta.dirname, '../assets/plugins');
const SOURCES = {
  amap: 'amap.svg',
  dingtalk: 'dingtalk.svg',
  feishu: 'feishu.svg',
  github: '../../packages/ui/icons/providers/light/github.svg',
  notion: 'notion.svg',
  wecom: 'wecom.svg',
};

// Native text attachments need precomposed chrome. Read the same neutral tokens
// and rounded-md radius used by the smallest PluginIcon, rather than copying colors.
function resolveToken(declarations: Map<string, Declaration>, name: string): string {
  const value = declarations.get(name)?.value;
  if (!value) throw new Error(`Missing plugin artwork token: ${name}`);
  const reference = /^var\((--[\w-]+)\)$/.exec(value);
  return reference ? resolveToken(declarations, reference[1]) : value;
}

function neutralColor(value: string): string {
  const match = /^oklch\(([\d.]+) 0 0(?: \/ ([\d.]+))?\)$/.exec(value);
  if (!match) throw new Error(`Expected a neutral OKLCH plugin artwork token: ${value}`);
  const linear = Number(match[1]) ** 3;
  const channel = Math.round(
    255 * (linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055),
  );
  return `rgba(${channel},${channel},${channel},${match[2] ?? 1})`;
}

async function renderAttachment(
  artwork: Buffer,
  scale: number,
  radius: number,
  theme: Map<string, Declaration>,
  monochrome: boolean,
) {
  const size = 48;
  const markSize = Math.round(size * scale);
  const offset = Math.floor((size - markSize) / 2);
  const surface = neutralColor(resolveToken(theme, '--card'));
  const border = neutralColor(resolveToken(theme, '--border'));
  let mark = await sharp(artwork).resize(markSize, markSize).png().toBuffer();
  if (monochrome) {
    const alpha = await sharp(mark).ensureAlpha().extractChannel('alpha').toBuffer();
    mark = await sharp({
      create: {
        width: markSize,
        height: markSize,
        channels: 3,
        background: neutralColor(resolveToken(theme, '--foreground')),
      },
    })
      .joinChannel(alpha)
      .png()
      .toBuffer();
  }
  const frame = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" rx="${radius}" fill="${surface}"/><rect x="1" y="1" width="46" height="46" rx="${radius - 1}" fill="none" stroke="${border}" stroke-width="2"/></svg>`,
  );
  return sharp(frame)
    .composite([{ input: mark, left: offset, top: offset }])
    .png()
    .toBuffer();
}

async function main() {
  // Keep the existing Lucide fallback; brand updates do not change UI icon artwork.
  const existing = JSON.parse(await readFile(path.join(ASSET_DIR, 'inline-icons.json'), 'utf8'));
  const inline: Record<string, string> = { 'file-text': existing['file-text'] };
  const { lightDeclarations, darkDeclarations } = buildThemeModel(await loadThemeSources());
  const native = extractDeclarations(
    await readFile(path.join(stylesDir, 'native.css'), 'utf8'),
    'native.css',
  );
  const radiusMultiplier = /^calc\(var\(--radius\) \* ([\d.]+)\)$/.exec(
    native.find(({ name }) => name === '--radius-md')?.value ?? '',
  );
  const radiusRem = /^([\d.]+)rem$/.exec(resolveToken(lightDeclarations, '--radius'));
  if (!radiusMultiplier || !radiusRem) throw new Error('Unsupported rounded-md radius token');
  const attachmentRadius = Number(radiusRem[1]) * 16 * Number(radiusMultiplier[1]) * 2;

  for (const id of Object.keys(SOURCES) as (keyof typeof SOURCES)[]) {
    const filename = SOURCES[id];
    let source = await readFile(path.join(ASSET_DIR, filename));
    if (id === 'feishu') {
      // Remove only the favicon's white plate, preserving all three brand paths.
      source = Buffer.from(
        source.toString().replace('<rect width="16" height="16" rx="2" fill="white"/>', ''),
      );
    }
    // Crop source padding before fitting every mark into the same square canvas.
    const raster = await sharp(source, { density: 864 }).png().toBuffer();
    const artwork = await sharp(raster)
      .trim({ background: '#00000000', threshold: 0 })
      .resize(144, 144, { fit: 'contain', background: '#00000000' })
      .png()
      .toBuffer();
    await sharp(artwork)
      .webp({ lossless: true, effort: 6 })
      .toFile(path.join(ASSET_DIR, `${id}.webp`));
    for (const [suffix, theme] of [
      ['', lightDeclarations],
      ['-dark', darkDeclarations],
    ] as const) {
      const attachment = await renderAttachment(
        artwork,
        opticalScales[id],
        attachmentRadius,
        theme,
        id === 'github' || id === 'notion',
      );
      inline[`${id}${suffix}`] = attachment.toString('base64');
    }
  }

  await writeFile(
    path.join(ASSET_DIR, 'inline-icons.json'),
    `${JSON.stringify(inline, null, 2)}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
