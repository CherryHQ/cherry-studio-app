import { ThemeMode } from '@cherrystudio/shared/data/preference';

import {
  applyPrimaryColorPreference,
  applyThemePreferences,
  DEFAULT_PRIMARY_COLOR,
  getPrimaryForeground,
} from '../theme';

const mockSetTheme = jest.fn();
const mockUpdateCSSVariables = jest.fn();
let mockCurrentTheme = 'light';

jest.mock('uniwind', () => ({
  Uniwind: {
    get currentTheme() {
      return mockCurrentTheme;
    },
    setTheme: (...args: unknown[]) => mockSetTheme(...args),
    updateCSSVariables: (...args: unknown[]) => mockUpdateCSSVariables(...args),
  },
}));

describe('theme runtime', () => {
  beforeEach(() => {
    mockSetTheme.mockClear();
    mockUpdateCSSVariables.mockClear();
    mockCurrentTheme = 'light';
  });

  test.each([
    ['#ffffff', '#000000'],
    ['#000000', '#ffffff'],
    ['#00b96b', '#000000'],
  ] as const)('uses a contrast-safe foreground for %s', (primary, foreground) => {
    expect(getPrimaryForeground(primary)).toBe(foreground);
  });

  test('normalizes short hex and updates the active theme last', () => {
    mockCurrentTheme = 'dark';

    applyPrimaryColorPreference('#0b6');

    const variables = {
      '--cs-theme-primary': '#00bb66',
      '--cs-theme-primary-foreground': '#000000',
    };
    expect(mockUpdateCSSVariables).toHaveBeenNthCalledWith(1, 'light', variables);
    expect(mockUpdateCSSVariables).toHaveBeenNthCalledWith(2, 'dark', variables);
  });

  test('falls back for an invalid stored color', () => {
    applyPrimaryColorPreference('not-a-color');

    expect(mockUpdateCSSVariables).toHaveBeenLastCalledWith(
      'light',
      expect.objectContaining({ '--cs-theme-primary': DEFAULT_PRIMARY_COLOR }),
    );
  });

  test('sets the requested mode before updating its variables', () => {
    applyThemePreferences(ThemeMode.dark, '#000000');

    expect(mockSetTheme).toHaveBeenCalledWith('dark');
    expect(mockUpdateCSSVariables).toHaveBeenCalledTimes(2);
  });
});
