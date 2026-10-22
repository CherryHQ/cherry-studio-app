import { readFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

const ASSETS = path.resolve(__dirname, '../assets');

async function generateDarkAppIcon() {
  const [artwork, outline] = await Promise.all([
    readFile(path.join(ASSETS, 'icon-light.png')),
    readFile(path.join(ASSETS, 'icon-mark.svg'), 'utf8'),
  ]);
  const mark = outline.match(/<g[\s\S]*<\/g>/)?.[0];
  if (!mark) throw new Error('The desktop icon outline is missing its mark group.');

  // Map the desktop SVG to the mark's bounds in the original 1024px artwork.
  // Inset three source pixels to exclude edge antialiasing mixed with the red background.
  // The PNG supplies the original gradients; the SVG only controls transparency.
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg"
      xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024">
      <defs>
        <filter id="inset"><feMorphology operator="erode" radius="3"/></filter>
        <mask id="mark" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
          <g filter="url(#inset)">
            <g transform="translate(161 146) scale(${701 / 64.1} ${732 / 66.73})">
              ${mark}
            </g>
          </g>
        </mask>
      </defs>
      <image width="1024" height="1024" mask="url(#mark)"
        xlink:href="data:image/png;base64,${artwork.toString('base64')}"/>
    </svg>`;

  await sharp(Buffer.from(svg)).png().toFile(path.join(ASSETS, 'icon-dark.png'));
}

generateDarkAppIcon().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
