import { Stack } from 'expo-router';

import { headerScreenOptions } from '@/frontend/appShell/header';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

export default function LibraryStackLayout() {
  const foregroundColor = useThemeColor('foreground');

  return (
    <Stack
      screenOptions={{
        ...headerScreenOptions,
        headerTransparent: isLiquidGlassAvailable,
        headerTintColor: foregroundColor,
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
