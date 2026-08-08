import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  createTypographyCSSVariables,
  normalizeFontSizeStep,
  resolveTypographyScale,
} from '../typographyScale';

describe('typography scale', () => {
  test.each([
    [0, 16, 24],
    [1, 18, 28],
    [2, 20, 26],
  ] as const)('moves base typography for step %i', (step, fontSize, lineHeight) => {
    expect(resolveTypographyScale(step).base).toEqual({ fontSize, lineHeight });
  });

  test('moves every size and caps the largest values', () => {
    const scale = resolveTypographyScale(2);

    expect(scale.xs).toEqual({ fontSize: 16, lineHeight: 24 });
    expect(scale['6xl']).toEqual({ fontSize: 96, lineHeight: 96 });
    expect(scale['8xl']).toEqual({ fontSize: 128, lineHeight: 128 });
    expect(scale['9xl']).toEqual({ fontSize: 128, lineHeight: 128 });
  });

  test.each([-1, 3, 1.5, '1', null, undefined])('normalizes invalid value %p', (value) => {
    expect(normalizeFontSizeStep(value)).toBe(0);
  });

  test('creates Tailwind font-size and line-height variables', () => {
    expect(createTypographyCSSVariables(1)).toMatchObject({
      '--ui-text-base': 18,
      '--ui-text-base--line-height': 28,
      '--ui-text-xs': 14,
      '--ui-text-xs--line-height': 20,
    });
  });

  test.each([
    [0, 32, 44],
    [1, 40, 56],
    [2, 48, 64],
  ] as const)(
    'creates scalable emoji typography with safe line height for step %i',
    (step, fontSize, lineHeight) => {
      expect(createTypographyCSSVariables(step)).toMatchObject({
        '--ui-emoji-3xl--line-height': lineHeight,
        '--ui-text-3xl': fontSize,
      });
    },
  );

  // applyFontSizeStep only writes these variables once the app runtime boots, so
  // the first frame — and any host that skips bootstrap, such as Storybook —
  // renders whatever `@theme static` declared at build time. That snapshot has
  // no other guard, and a stale copy is invisible in the running app.
  test('global.css seeds the same variables the runtime writes for step 0', () => {
    const globalCss = readFileSync(path.join(__dirname, '../../styles/global.css'), 'utf8');
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
