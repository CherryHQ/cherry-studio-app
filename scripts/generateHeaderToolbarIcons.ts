import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'assets', 'header-toolbar');
// Header action glyphs render at 18pt (`HeaderAction`); UIKit picks the scale variant itself.
const POINT_SIZE = 18;
const SCALES = [1, 2, 3];

const stroke = 'fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round"';
const folder =
  'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z';

// Same geometry as `SidebarExpandIcon`, `NewConversationIcon` and lucide `folder`/`folder-check`.
const GLYPHS: Record<string, string> = {
  sidebar: `<rect x="3.5" y="4" width="17" height="16" rx="4" ${stroke} stroke-width="1.7"/><path d="M9.5 5v14" ${stroke} stroke-width="1.7"/>`,
  folder: `<path d="${folder}" ${stroke} stroke-width="2"/>`,
  'folder-check': `<path d="${folder}" ${stroke} stroke-width="2"/><path d="m9 13 2 2 4-4" ${stroke} stroke-width="2"/>`,
  'new-chat': `<g transform="translate(12 12) scale(1.1) translate(-12 -12)" ${stroke} stroke-width="1.8"><path d="M13 4H6a2 2 0 0 0-2 2v13l4-3h10a2 2 0 0 0 2-2v-3"/><path d="M18 3.5v5"/><path d="M15.5 6h5"/></g>`,
};

/** Template images for the native chat header buttons; the toolbar tints them. */
async function generateHeaderToolbarIcons() {
  await mkdir(OUTPUT, { recursive: true });
  for (const [name, glyph] of Object.entries(GLYPHS)) {
    for (const scale of SCALES) {
      const size = POINT_SIZE * scale;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${glyph}</svg>`;
      const suffix = scale === 1 ? '' : `@${scale}x`;
      await sharp(Buffer.from(svg))
        .png()
        .toFile(path.join(OUTPUT, `${name}${suffix}.png`));
    }
  }
}

generateHeaderToolbarIcons().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
