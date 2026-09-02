import { Stack } from 'expo-router';

import { headerScreenOptions } from '@/frontend/appShell/header';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

export default function HomeStackLayout() {
  const foregroundColor = useThemeColor('foreground');

  return (
    <Stack
      screenOptions={{
        ...headerScreenOptions,
        headerTransparent: isLiquidGlassAvailable,
        headerTintColor: foregroundColor,
      }}
    >
      {/* Screens declared here are ordered ahead of the auto-generated ones, and the stack's
          initial route is whichever comes first. Declaring `index` keeps Home rooted at the
          overview instead of booting straight into the usage detail. */}
      <Stack.Screen name="index" />
      <Stack.Screen
        name="ai-usage"
        options={{
          fullScreenGestureEnabled: true,
          gestureEnabled: true,
        }}
      />
    </Stack>
  );
}
