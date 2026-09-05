import { createTypographyCSSVariables } from '@cherrystudio/ui/utils';
import { Uniwind } from 'uniwind';

import { type FontSizeStep, ThemeMode } from '@/shared/data/preference';

/**
 * The primary-colour half of this module used to live here: `DEFAULT_PRIMARY_COLOR`,
 * hex normalization, a WCAG relative-luminance test picking black or white ink,
 * and `applyPrimaryColorPreference` writing the resulting pair into
 * `--theme-primary{,-foreground}` on both themes at startup.
 *
 * All of it fed `ui.theme_user.color_primary`, a preference no mobile screen
 * ever wrote — bootstrap read it once and nothing else touched it — so the
 * machinery let the user recolour the app through a control that does not
 * exist. `--primary` reads `--brand` directly now (see shadcn.css). The
 * preference key stays in packages/universal because it is persisted data
 * shared with desktop; reviving the feature means adding the screen and
 * re-introducing this pair, not resurrecting a dead default.
 */

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
