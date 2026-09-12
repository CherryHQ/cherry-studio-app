import { ThemeMode } from '@/shared/data/preference';

import { applyFontSizeStepPreference, applyThemePreferences } from '../theme';

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
    applyThemePreferences(ThemeMode.dark, 0);

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
});
