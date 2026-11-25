import { Stack } from 'expo-router';

import { headerScreenOptions } from '@/frontend/appShell/header';
import { FormContentFrame } from '@/frontend/appShell/layout';
import { NavRouteHeaderScope } from '@/frontend/appShell/navigationShell';
import { DesktopPairingProvider } from '@/frontend/features/settings/DeviceConnectionsScreen';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

export default function SettingsStackLayout() {
  const [backgroundColor, foregroundColor] = useThemeColor(['background', 'foreground']);

  return (
    <NavRouteHeaderScope destination="settings">
      <DesktopPairingProvider>
        <Stack
          screenLayout={FormContentFrame}
          screenOptions={{
            ...headerScreenOptions,
            contentStyle: { backgroundColor },
            headerTransparent: false,
            headerTintColor: foregroundColor,
          }}
        >
          <Stack.Screen name="index" options={{ title: '' }} />
          <Stack.Screen
            name="about/feedback/[reportId]"
            getId={({ params }) => getSingleRouteParam(params?.reportId)}
          />
        </Stack>
      </DesktopPairingProvider>
    </NavRouteHeaderScope>
  );
}
