import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import opticalScales from '../assets/plugins/optical-scales.json';

const ASSET_DIR = path.resolve(import.meta.dirname, '../assets/plugins');
const SOURCES = {
  amap: 'amap.svg',
  dingtalk: 'dingtalk.svg',
  feishu: 'feishu.svg',
  github: '../../packages/ui/icons/providers/light/github.svg',
  notion: 'notion.svg',
  wecom: 'wecom.svg',
};

const MAX_OPTICAL_SCALE = Math.max(...Object.values(opticalScales));

async function renderAttachment(artwork: Buffer, scale: number) {
  const size = 48;
  // Keep relative visual weights, without the page frame's surrounding padding.
  const markSize = Math.round((size * scale) / MAX_OPTICAL_SCALE);
  const offset = Math.floor((size - markSize) / 2);
  return sharp(artwork)
    .resize(markSize, markSize)
    .extend({
      top: offset,
      bottom: size - markSize - offset,
      left: offset,
      right: size - markSize - offset,
      background: '#00000000',
    })
    .png()
    .toBuffer();
}

async function main() {
  // Keep the existing Lucide fallback; brand updates do not change UI icon artwork.
  const existing = JSON.parse(await readFile(path.join(ASSET_DIR, 'inline-icons.json'), 'utf8'));
  const inline: Record<string, string> = { 'file-text': existing['file-text'] };

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
    const attachment = await renderAttachment(artwork, opticalScales[id]);
    inline[id] = attachment.toString('base64');
    if (id === 'github' || id === 'notion') {
      inline[`${id}-dark`] = (
        await sharp(attachment).negate({ alpha: false }).png().toBuffer()
      ).toString('base64');
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
