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

// Native-only derivatives of the existing header glyphs. Keep geometry in sync with
// `SidebarExpandIcon`, `NewConversationIcon` and the matching `@cherrystudio/app-icons` adapters.
const GLYPHS: Record<string, string> = {
  sidebar: `<rect x="3.5" y="4" width="17" height="16" rx="4" ${stroke} stroke-width="1.7"/><path d="M9.5 5v14" ${stroke} stroke-width="1.7"/>`,
  folder: `<path d="${folder}" ${stroke} stroke-width="2"/>`,
  'folder-check': `<path d="${folder}" ${stroke} stroke-width="2"/><path d="m9 13 2 2 4-4" ${stroke} stroke-width="2"/>`,
  'new-chat': `<g transform="translate(12 12) scale(1.1) translate(-12 -12)" ${stroke} stroke-width="1.8"><path d="M13 4H6a2 2 0 0 0-2 2v13l4-3h10a2 2 0 0 0 2-2v-3"/><path d="M18 3.5v5"/><path d="M15.5 6h5"/></g>`,
  'arrow-left': `<path d="m12 19-7-7 7-7" ${stroke} stroke-width="2"/><path d="M19 12H5" ${stroke} stroke-width="2"/>`,
  x: `<path d="M18 6 6 18" ${stroke} stroke-width="2"/><path d="m6 6 12 12" ${stroke} stroke-width="2"/>`,
  ellipsis: `<circle cx="12" cy="12" r="1" ${stroke} stroke-width="2"/><circle cx="19" cy="12" r="1" ${stroke} stroke-width="2"/><circle cx="5" cy="12" r="1" ${stroke} stroke-width="2"/>`,
  plus: `<path d="M5 12h14" ${stroke} stroke-width="2"/><path d="M12 5v14" ${stroke} stroke-width="2"/>`,
  'refresh-cw': `<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" ${stroke} stroke-width="2"/><path d="M21 3v5h-5" ${stroke} stroke-width="2"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" ${stroke} stroke-width="2"/><path d="M8 16H3v5" ${stroke} stroke-width="2"/>`,
  search: `<path d="m21 21-4.34-4.34" ${stroke} stroke-width="2"/><circle cx="11" cy="11" r="8" ${stroke} stroke-width="2"/>`,
  copy: `<rect width="14" height="14" x="8" y="8" rx="2" ry="2" ${stroke} stroke-width="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" ${stroke} stroke-width="2"/>`,
  'file-text': `<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" ${stroke} stroke-width="2"/><path d="M14 2v4a2 2 0 0 0 2 2h4" ${stroke} stroke-width="2"/><path d="M10 9H8" ${stroke} stroke-width="2"/><path d="M16 13H8" ${stroke} stroke-width="2"/><path d="M16 17H8" ${stroke} stroke-width="2"/>`,
  languages: `<path d="m5 8 6 6" ${stroke} stroke-width="2"/><path d="m4 14 6-6 2-3" ${stroke} stroke-width="2"/><path d="M2 5h12" ${stroke} stroke-width="2"/><path d="M7 2h1" ${stroke} stroke-width="2"/><path d="m22 22-5-10-5 10" ${stroke} stroke-width="2"/><path d="M14 18h6" ${stroke} stroke-width="2"/>`,
  camera: `<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" ${stroke} stroke-width="2"/><circle cx="12" cy="13" r="3" ${stroke} stroke-width="2"/>`,
};

/** Template images for the native header buttons and menus; the toolbar tints them. */
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
