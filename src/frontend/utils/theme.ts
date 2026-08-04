import { type FontSizeStep, ThemeMode } from '@cherrystudio/universal/data/preference';
import { Uniwind } from 'uniwind';

import { createTypographyCSSVariables } from './typographyScale';

export const DEFAULT_PRIMARY_COLOR = '#00b96b';

function updateBothThemes(variables: Record<string, string | number>) {
  const activeTheme = Uniwind.currentTheme === 'dark' ? 'dark' : 'light';
  const inactiveTheme = activeTheme === 'light' ? 'dark' : 'light';

  Uniwind.updateCSSVariables(inactiveTheme, variables);
  Uniwind.updateCSSVariables(activeTheme, variables);
}

function createPrimaryColorVariables(primaryColor: string) {
  const normalized = normalizeHexColor(primaryColor);

  return {
    '--cs-theme-primary': normalized,
    '--cs-theme-primary-foreground': getPrimaryForeground(normalized),
  };
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

function normalizeHexColor(value: string): string {
  const normalized = value.trim().toLowerCase();
  const shortMatch = normalized.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);

  if (shortMatch) {
    return `#${shortMatch[1]}${shortMatch[1]}${shortMatch[2]}${shortMatch[2]}${shortMatch[3]}${shortMatch[3]}`;
  }

  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : DEFAULT_PRIMARY_COLOR;
}

function relativeLuminanceComponent(value: number): number {
  const component = value / 255;
  return component <= 0.03928 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4;
}

export function getPrimaryForeground(primaryColor: string): '#000000' | '#ffffff' {
  const normalized = normalizeHexColor(primaryColor);
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  const luminance =
    0.2126 * relativeLuminanceComponent(red) +
    0.7152 * relativeLuminanceComponent(green) +
    0.0722 * relativeLuminanceComponent(blue);

  return luminance > 0.179 ? '#000000' : '#ffffff';
}

export function applyPrimaryColorPreference(primaryColor: string) {
  updateBothThemes(createPrimaryColorVariables(primaryColor));
}

export function applyFontSizeStepPreference(fontSizeStep: FontSizeStep) {
  updateBothThemes(createTypographyCSSVariables(fontSizeStep));
}

export function applyThemePreferences(
  themeMode: ThemeMode,
  primaryColor: string,
  fontSizeStep: FontSizeStep,
) {
  applyThemeModePreference(themeMode);
  updateBothThemes({
    ...createPrimaryColorVariables(primaryColor),
    ...createTypographyCSSVariables(fontSizeStep),
  });
}
