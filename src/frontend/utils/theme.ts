import { createTypographyCSSVariables } from '@cherrystudio/ui/utils';
import { Uniwind } from 'uniwind';

import { type FontSizeStep, ThemeMode } from '@/shared/data/preference';

// Action colors are authored in shadcn.css; Mobile currently exposes only mode and font-size settings.

function updateBothThemes(variables: Record<string, string | number>) {
  const activeTheme = Uniwind.currentTheme === 'dark' ? 'dark' : 'light';
  const inactiveTheme = activeTheme === 'light' ? 'dark' : 'light';

  Uniwind.updateCSSVariables(inactiveTheme, variables);
  Uniwind.updateCSSVariables(activeTheme, variables);
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
  updateBothThemes(createTypographyCSSVariables(fontSizeStep));
}

export function applyThemePreferences(themeMode: ThemeMode, fontSizeStep: FontSizeStep) {
  applyThemeModePreference(themeMode);
  updateBothThemes(createTypographyCSSVariables(fontSizeStep));
}
