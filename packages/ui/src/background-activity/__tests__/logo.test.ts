import { join } from 'node:path';

import sharp from 'sharp';

import { CHERRY_ACTIVITY_LOGO_DARK_BASE64, CHERRY_ACTIVITY_LOGO_LIGHT_BASE64 } from '../logo';

describe('background activity logo', () => {
  test.each([
    ['dark', CHERRY_ACTIVITY_LOGO_DARK_BASE64],
    ['light', CHERRY_ACTIVITY_LOGO_LIGHT_BASE64],
  ])(
    'keeps the %s bitmap within Live Activity limits and preserves its background',
    async (theme, base64) => {
      const png = Buffer.from(base64, 'base64');
      // UIImage(data:) loads these at scale 1. A small layout frame must not
      // conceal an oversized bitmap from this regression check.
      await expect(sharp(png).metadata()).resolves.toMatchObject({
        format: 'png',
        width: 32,
        height: 32,
      });

      const { data, info } = await sharp(png)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(data.length).toBe(32 * 32 * 4);
      const alpha = Array.from(data).filter((_, index) => index % info.channels === 3);
      expect(Math.max(...alpha)).toBe(255);
      expect(Math.min(...alpha)).toBe(theme === 'dark' ? 0 : 255);
      // Artwork colors come from the original pixels, not the UI's brand token.
      const originalBackground = await sharp(join(process.cwd(), 'assets', `icon-${theme}.png`))
        .extract({ left: 0, top: 0, width: 1, height: 1 })
        .ensureAlpha()
        .raw()
        .toBuffer();
      expect(data.subarray(0, 4)).toEqual(originalBackground);
    },
  );
});
