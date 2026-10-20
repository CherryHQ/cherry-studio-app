import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CHERRY_ACTIVITY_LOGO_DARK_BASE64, CHERRY_ACTIVITY_LOGO_LIGHT_BASE64 } from '../logo';

describe('background activity logo', () => {
  test.each([
    ['dark', CHERRY_ACTIVITY_LOGO_DARK_BASE64],
    ['light', CHERRY_ACTIVITY_LOGO_LIGHT_BASE64],
  ])(
    'preserves the original %s app artwork without recoloring or replacing it',
    (theme, base64) => {
      expect(Buffer.from(base64, 'base64')).toEqual(
        readFileSync(join(process.cwd(), 'assets', `icon-${theme}.png`)),
      );
    },
  );
});
