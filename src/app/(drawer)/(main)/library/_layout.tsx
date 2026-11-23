import { Stack } from 'expo-router';

import { headerScreenOptions } from '@/frontend/appShell/header';
import { useOptionalNavigationShell } from '@/frontend/appShell/navigationShell/state';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

export default function LibraryStackLayout() {
  const foregroundColor = useThemeColor('foreground');
  const shell = useOptionalNavigationShell();
  const isWideRail = shell?.shellMode === 'wide-rail';

  return (
    <Stack
      screenOptions={{
        ...headerScreenOptions,
        headerTransparent: isLiquidGlassAvailable,
        headerTintColor: foregroundColor,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: !isWideRail }} />
    </Stack>
  );
}
