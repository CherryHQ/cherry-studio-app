import { DefaultTheme, ThemeProvider } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { useUniwind } from 'uniwind';

import { usePreference } from '@/frontend/data/hooks';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { applyThemePalettePreference } from '@/frontend/utils/theme';

type NavigationThemeProviderProps = {
  children: React.ReactNode;
};

export function NavigationThemeProvider({ children }: NavigationThemeProviderProps) {
  const [themePalette] = usePreference('ui.theme_palette');
  const { theme } = useUniwind();
  const [background, foreground, separator] = useThemeColor([
    'background',
    'foreground',
    'border-strong',
  ]);

  // The preference service publishes optimistic writes and their rollback through the same
  // subscription. Keeping the bridge here also applies changes made outside the settings page.
  useEffect(() => {
    applyThemePalettePreference(themePalette);
  }, [themePalette]);

  const navigationTheme = useMemo(
    () => ({
      ...DefaultTheme,
      dark: theme === 'dark',
      colors: {
        ...DefaultTheme.colors,
        // Native navigators own the app canvas and header surface. Route views
        // stay transparent; content uses card, secondary, or popover only when
        // its own semantic role earns a separate surface.
        background,
        border: separator,
        card: background,
        notification: foreground,
        primary: foreground,
        text: foreground,
      },
    }),
    [background, foreground, separator, theme],
  );

  return <ThemeProvider value={navigationTheme}>{children}</ThemeProvider>;
}
