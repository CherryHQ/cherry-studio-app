import { Stack } from 'expo-router';

import { headerScreenOptions } from '@/frontend/appShell/header';
import { getRootHeaderStyle } from '@/frontend/appShell/navigation';
import { NavRouteHeaderScope } from '@/frontend/appShell/navigationShell';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

export default function MoreStackLayout() {
  const [backgroundColor, foregroundColor] = useThemeColor(['background', 'foreground']);

  return (
    <NavRouteHeaderScope destination="more">
      <Stack
        screenOptions={{
          ...headerScreenOptions,
          contentStyle: { backgroundColor },
          headerStyle: getRootHeaderStyle(backgroundColor),
          headerTransparent: isLiquidGlassAvailable,
          headerTintColor: foregroundColor,
        }}
      />
    </NavRouteHeaderScope>
  );
}
