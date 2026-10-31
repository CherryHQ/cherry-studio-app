import {
  createThemePaletteVariables,
  type ThemeAppearance,
  type ThemePaletteId,
} from '@cherrystudio/design-tokens/palettes';
import { createTypographyCSSVariables } from '@cherrystudio/ui/utils';
import { Uniwind } from 'uniwind';

import { type FontSizeStep, ThemeMode } from '@/shared/data/preference';

function updateBothThemes(
  variables: (appearance: ThemeAppearance) => Record<string, string | number>,
) {
  const activeTheme = Uniwind.currentTheme === 'dark' ? 'dark' : 'light';
  const inactiveTheme = activeTheme === 'light' ? 'dark' : 'light';

  Uniwind.updateCSSVariables(inactiveTheme, variables(inactiveTheme));
  Uniwind.updateCSSVariables(activeTheme, variables(activeTheme));
}

export function applyThemeModePreference(themeMode: ThemeMode) {
  switch (themeMode) {
    case ThemeMode.dark:
      Uniwind.setTheme('dark');
      break;
    case ThemeMode.light:
      Uniwind.setTheme('light');
      break;
    case ThemeMode.system:
      Uniwind.setTheme('system');
      break;
  }
}

export function applyFontSizeStepPreference(fontSizeStep: FontSizeStep) {
  const variables = createTypographyCSSVariables(fontSizeStep);
  updateBothThemes(() => variables);
}

export function applyThemePalettePreference(themePalette: ThemePaletteId) {
  updateBothThemes((appearance) => createThemePaletteVariables(themePalette, appearance));
}

export function applyThemePreferences(
  themeMode: ThemeMode,
  fontSizeStep: FontSizeStep,
  themePalette: ThemePaletteId,
) {
  applyThemeModePreference(themeMode);
  const typography = createTypographyCSSVariables(fontSizeStep);
  updateBothThemes((appearance) => ({
    ...createThemePaletteVariables(themePalette, appearance),
    ...typography,
  }));
}
