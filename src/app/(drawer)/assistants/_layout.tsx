import { Stack } from 'expo-router';

import { headerScreenOptions } from '@/frontend/components/headers';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

export default function AssistantsStackLayout() {
  const [foregroundColor, groupedBackground] = useThemeColor(['foreground', 'grouped-background']);
  // Detail, edit and new are grouped-card screens; the assistant list at `index`
  // and the model picker are plain full-bleed lists and keep the ordinary page
  // background, so this is per-screen rather than a stack-wide
  // `screenOptions.contentStyle`.
  const groupedScreen = { contentStyle: { backgroundColor: groupedBackground } };

  return (
    <Stack
      screenOptions={{
        ...headerScreenOptions,
        headerTransparent: isLiquidGlassAvailable,
        headerTintColor: foregroundColor,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[assistantId]/index" options={groupedScreen} />
      <Stack.Screen name="[assistantId]/edit" options={groupedScreen} />
      <Stack.Screen name="new" options={groupedScreen} />
      {/* The shared model picker puts its type tabs directly under the bar and
          its list under those, with no scroll view at the top to take an
          automatic inset — so it needs an opaque bar to start below, the way
          the same screen behaves in the settings stack. The navigation theme's
          card color is the page background, so nothing seams. */}
      <Stack.Screen name="model-select" options={{ headerTransparent: false }} />
    </Stack>
  );
}
