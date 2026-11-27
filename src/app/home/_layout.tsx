import { Stack } from 'expo-router';

import { headerScreenOptions } from '@/frontend/appShell/header';
import { ReadingContentFrame } from '@/frontend/appShell/layout';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

export default function HomeStackLayout() {
  const foregroundColor = useThemeColor('foreground');

  return (
    <Stack
      screenLayout={ReadingContentFrame}
      screenOptions={{
        ...headerScreenOptions,
        headerTransparent: isLiquidGlassAvailable,
        headerTintColor: foregroundColor,
      }}
    >
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
