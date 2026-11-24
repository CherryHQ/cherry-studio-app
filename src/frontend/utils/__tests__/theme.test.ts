import {
  createThemePaletteVariables,
  THEME_PALETTE_IDS,
  THEME_PALETTES,
} from '@cherrystudio/design-tokens/palettes';

import { ThemeMode } from '@/shared/data/preference';

import {
  applyFontSizeStepPreference,
  applyThemePalettePreference,
  applyThemePreferences,
} from '../theme';

const mockSetTheme = jest.fn();
const mockUpdateCSSVariables = jest.fn();
let mockCurrentTheme = 'light';

jest.mock('uniwind', () => ({
  Uniwind: {
    get currentTheme() {
      return mockCurrentTheme;
    },
    setTheme: (theme: string) => {
      mockSetTheme(theme);
      if (theme === 'dark' || theme === 'light') {
        mockCurrentTheme = theme;
      }
    },
    updateCSSVariables: (...args: unknown[]) => mockUpdateCSSVariables(...args),
  },
}));
jest.mock('heroui-native/utils', () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(' '),
}));

describe('theme runtime', () => {
  beforeEach(() => {
    mockSetTheme.mockClear();
    mockUpdateCSSVariables.mockClear();
    mockCurrentTheme = 'light';
  });

  test('sets the requested mode before updating its variables', () => {
    applyThemePreferences(ThemeMode.dark, 0, 'green');

    expect(mockSetTheme).toHaveBeenCalledWith('dark');
    expect(mockUpdateCSSVariables).toHaveBeenCalledTimes(2);
    expect(mockUpdateCSSVariables).toHaveBeenLastCalledWith(
      'dark',
      expect.objectContaining({ '--ui-text-base': 16 }),
    );
  });

  test('updates typography variables for both themes with the active theme last', () => {
    mockCurrentTheme = 'dark';

    applyFontSizeStepPreference(1);

    const variables = expect.objectContaining({
      '--ui-text-base': 18,
      '--ui-text-base--line-height': 28,
    });
    expect(mockUpdateCSSVariables).toHaveBeenNthCalledWith(1, 'light', variables);
    expect(mockUpdateCSSVariables).toHaveBeenNthCalledWith(2, 'dark', variables);
  });

  test('prepares both palette modes without overriding the system appearance preference', () => {
    mockCurrentTheme = 'dark';

    applyThemePalettePreference('blue');

    expect(mockSetTheme).not.toHaveBeenCalled();
    expect(mockUpdateCSSVariables.mock.calls).toEqual([
      [
        'light',
        {
          '--primary': '#005ff2',
          '--primary-foreground': '#ffffff',
          '--control-active': '#006efe',
        },
      ],
      [
        'dark',
        {
          '--primary': '#47a8ff',
          '--primary-foreground': '#000000',
          '--control-active': '#006efe',
        },
      ],
    ]);
  });

  test('falls back to the default colors for an unknown restored palette', () => {
    expect(createThemePaletteVariables('future-palette', 'light')).toEqual(
      createThemePaletteVariables('green', 'light'),
    );
    expect(createThemePaletteVariables(null, 'dark')).toEqual(
      createThemePaletteVariables('green', 'dark'),
    );
  });

  test.each(THEME_PALETTE_IDS)('%s preserves readable emphasis and its paired foreground', (id) => {
    for (const appearance of ['light', 'dark'] as const) {
      const variables = createThemePaletteVariables(id, appearance);
      const primary = variables['--primary'];
      const foreground = variables['--primary-foreground'];
      const surfaces = appearance === 'light' ? ['#ffffff', '#f5f5f5'] : ['#000000', '#1a1a1a'];

      expect(contrast(primary, foreground)).toBeGreaterThanOrEqual(4.5);
      for (const surface of surfaces) {
        expect(contrast(primary, surface)).toBeGreaterThanOrEqual(4.5);
      }
      expect(primary).toBe(THEME_PALETTES[id][appearance]);
    }
  });
});

function contrast(first: string, second: string) {
  const luminance = (color: string) => {
    const channels = [1, 3, 5].map((offset) => {
      const channel = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
