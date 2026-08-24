import { Stack } from 'expo-router';

import { headerScreenOptions } from '@/frontend/components/headers';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

export default function SettingsStackLayout() {
  const [foregroundColor, groupedBackground] = useThemeColor(['foreground', 'grouped-background']);

  return (
    <Stack
      screenOptions={{
        ...headerScreenOptions,
        // Every screen in this stack is a grouped list, so the page background
        // is set once here instead of on each screen's root view. Light mode is
        // the one that moves: the page goes gray and the cards go white, the way
        // iOS Settings does it. Dark is unchanged — the page was already pure
        // black and the cards already sat a step above it.
        contentStyle: { backgroundColor: groupedBackground },
        // The bar takes the page color too. This stack keeps an opaque header
        // (`headerTransparent: false`), so leaving it on the navigation theme's
        // white would put a seam between a white bar and a gray page — iOS
        // Settings has no such seam, its bar matches the grouped background.
        headerStyle: { backgroundColor: groupedBackground },
        headerTransparent: false,
        headerTintColor: foregroundColor,
      }}
    >
      <Stack.Screen name="index" options={{ title: '' }} />
    </Stack>
  );
}
