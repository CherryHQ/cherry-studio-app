import { DefaultTheme, ThemeProvider } from 'expo-router';
import { useMemo } from 'react';
import { useUniwind } from 'uniwind';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

type NavigationThemeProviderProps = {
  children: React.ReactNode;
};

export function NavigationThemeProvider({ children }: NavigationThemeProviderProps) {
  const { theme } = useUniwind();
  const [primary, background, foreground, separator] = useThemeColor([
    'primary',
    'background',
    'foreground',
    'separator',
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
        notification: primary,
        primary,
        text: foreground,
      },
    }),
    [background, foreground, primary, separator, theme],
  );

  return <ThemeProvider value={navigationTheme}>{children}</ThemeProvider>;
}
