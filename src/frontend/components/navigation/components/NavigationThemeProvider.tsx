import { DefaultTheme, ThemeProvider } from 'expo-router';
import { useThemeColor } from 'heroui-native/hooks';
import { useMemo } from 'react';
import { useUniwind } from 'uniwind';

type NavigationThemeProviderProps = {
  children: React.ReactNode;
};

export function NavigationThemeProvider({ children }: NavigationThemeProviderProps) {
  const { theme } = useUniwind();
  const [accent, background, foreground, separator] = useThemeColor([
    'accent',
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
        notification: accent,
        primary: accent,
        text: foreground,
      },
    }),
    [accent, background, foreground, separator, theme],
  );

  return <ThemeProvider value={navigationTheme}>{children}</ThemeProvider>;
}
