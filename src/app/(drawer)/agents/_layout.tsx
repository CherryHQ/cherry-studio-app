import { Stack } from 'expo-router';

import { headerScreenOptions } from '@/frontend/components/headers';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

export default function AgentsStackLayout() {
  const [foregroundColor, groupedBackground] = useThemeColor(['foreground', 'grouped-background']);
  // Edit and new are grouped-card screens while the agent list at `index`
  // keeps the ordinary page background, so this is per-screen rather than a
  // stack-wide `screenOptions.contentStyle`.
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
      <Stack.Screen name="[agentId]/edit" options={groupedScreen} />
      <Stack.Screen name="new" options={groupedScreen} />
    </Stack>
  );
}
