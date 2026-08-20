import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createTypographyCSSVariables } from '@cherrystudio/ui/utils';

jest.mock('heroui-native/utils', () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(' '),
}));

describe('typography CSS variables', () => {
  it('seeds the same variables the runtime writes for step 0', () => {
    const globalCss = readFileSync(path.join(__dirname, '../global.css'), 'utf8');
    const staticTheme = /@theme static \{([\s\S]*?)\n\}/.exec(globalCss)?.[1];
    if (!staticTheme) {
      throw new Error('global.css no longer declares a `@theme static` block.');
    }

    const declared = Object.fromEntries(
      [...staticTheme.matchAll(/(--ui-(?:text|emoji)-[\w-]+):\s*(\d+)px;/g)].map(
        ([, name, value]) => [name, Number(value)],
      ),
    );

    expect(declared).toEqual(createTypographyCSSVariables(0));
  });
});
