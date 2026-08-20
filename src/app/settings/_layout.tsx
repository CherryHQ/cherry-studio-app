import { Stack } from 'expo-router';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

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
        headerShadowVisible: false,
        headerTransparent: false,
        headerTintColor: foregroundColor,
      }}
    >
      {/* The root keeps the native header so its back button is the same glass
          circle as every sub-screen's back button, and so pushing a sub-screen
          doesn't have to materialize a header that wasn't there — which is what
          made the bar jump on entry. It is transparent and untitled because the
          screen draws its own hero under it and its own title into the sticky
          bar. Declared here at the layout level, not via a runtime
          <Stack.Screen> inside the screen, so the header is correct on the
          first frame. */}
      <Stack.Screen
        name="index"
        options={{
          headerStyle: { backgroundColor: 'transparent' },
          headerTransparent: true,
          title: '',
        }}
      />
    </Stack>
  );
}
