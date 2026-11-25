import { Stack } from 'expo-router';

import { headerScreenOptions } from '@/frontend/appShell/header';
import { NavRouteHeaderScope } from '@/frontend/appShell/navigationShell';
import { useOptionalNavigationShell } from '@/frontend/appShell/navigationShell/state';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

export default function LibraryStackLayout() {
  const [backgroundColor, foregroundColor] = useThemeColor(['background', 'foreground']);
  const shell = useOptionalNavigationShell();
  const isWideRail = shell?.shellMode === 'wide-rail';

  return (
    <NavRouteHeaderScope destination="files">
      <Stack
        screenOptions={{
          ...headerScreenOptions,
          contentStyle: { backgroundColor },
          headerTransparent: isLiquidGlassAvailable,
          headerTintColor: foregroundColor,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: !isWideRail }} />
      </Stack>
    </NavRouteHeaderScope>
  );
}
