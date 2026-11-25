import { Stack } from 'expo-router';

import { headerScreenOptions } from '@/frontend/appShell/header';
import { FormContentFrame } from '@/frontend/appShell/layout';
import { NavRouteHeaderScope } from '@/frontend/appShell/navigationShell';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

export default function PluginsStackLayout() {
  const foreground = useThemeColor('foreground');
  const background = useThemeColor('background');
  return (
    <NavRouteHeaderScope destination="plugins">
      <Stack
        screenLayout={FormContentFrame}
        screenOptions={{
          ...headerScreenOptions,
          headerTransparent: false,
          headerTintColor: foreground,
          contentStyle: { backgroundColor: background },
        }}
      >
        <Stack.Screen
          name="mcp/oauth-callback"
          options={{ animation: 'none', headerShown: false }}
        />
        <Stack.Screen
          name="[pluginId]/callback"
          options={{ animation: 'none', headerShown: false }}
        />
      </Stack>
    </NavRouteHeaderScope>
  );
}
