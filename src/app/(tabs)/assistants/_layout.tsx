import { Stack } from 'expo-router';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

export default function AssistantsStackLayout() {
  const [foregroundColor, groupedBackground] = useThemeColor(['foreground', 'grouped-background']);
  // Detail, edit and new are grouped-card screens; the list at `index` is a
  // plain full-bleed list and keeps the ordinary page background, so this is
  // per-screen rather than a stack-wide `screenOptions.contentStyle`.
  const groupedScreen = { contentStyle: { backgroundColor: groupedBackground } };

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerTransparent: isLiquidGlassAvailable,
        headerTintColor: foregroundColor,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[assistantId]/index" options={groupedScreen} />
      <Stack.Screen name="[assistantId]/edit" options={groupedScreen} />
      <Stack.Screen name="new" options={groupedScreen} />
    </Stack>
  );
}
