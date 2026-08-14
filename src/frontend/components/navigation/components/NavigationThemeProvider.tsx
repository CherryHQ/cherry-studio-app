import { DefaultTheme, ThemeProvider } from 'expo-router';
import { useMemo } from 'react';
import { useUniwind } from 'uniwind';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

type NavigationThemeProviderProps = {
  children: React.ReactNode;
};

export function NavigationThemeProvider({ children }: NavigationThemeProviderProps) {
  const { theme } = useUniwind();
  const [background, foreground, separator] = useThemeColor([
    'background',
    'foreground',
    'border-strong',
  ]);

  const navigationTheme = useMemo(
    () => ({
      ...DefaultTheme,
      dark: theme === 'dark',
      colors: {
        ...DefaultTheme.colors,
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
