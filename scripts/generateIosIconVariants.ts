import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

async function main() {
  const assetsRoot = new URL('../assets/', import.meta.url);
  const logo = readFileSync(new URL('cherry-studio-splash-logo.svg', assetsRoot), 'utf8');
  const size = 1024;

  // Dark artwork leaves the background to iOS. Tinted artwork supplies a neutral
  // luminance mask, with the same vector geometry and canvas as the dark icon.
  await sharp(Buffer.from(logo), { density: 384 })
    .resize(size, size)
    .png()
    .toFile(fileURLToPath(new URL('icon-dark.png', assetsRoot)));

  await sharp(Buffer.from(logo.replace('fill="#FF5757"', 'fill="#FFFFFF"')), { density: 384 })
    .resize(size, size)
    .flatten({ background: '#000000' })
    .removeAlpha()
    .png()
    .toFile(fileURLToPath(new URL('icon-tinted.png', assetsRoot)));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
