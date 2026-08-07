import { Stack } from 'expo-router';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isIOS } from '@/frontend/utils/constants';

export default function SettingsStackLayout() {
  const [foregroundColor, groupedBackground] = useThemeColor(['foreground', 'grouped-background']);

  return (
    <Stack
      screenOptions={{
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
        headerShadowVisible: isIOS ? undefined : false,
        headerTransparent: false,
        headerTintColor: foregroundColor,
      }}
    >
      {/* Settings root renders its own animated profile hero + sticky bar
          (headerShown:false). Declared here at the layout level — not via a
          runtime <Stack.Screen> inside the screen — so the native header never
          flashes on first frame. Sub-screens keep the native header. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
