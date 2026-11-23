import { Stack } from 'expo-router';

import { headerScreenOptions } from '@/frontend/appShell/header';
import { getRootHeaderStyle } from '@/frontend/appShell/navigation';
import { DesktopPairingProvider } from '@/frontend/features/settings/DeviceConnectionsScreen';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

export default function DevicesStackLayout() {
  const [backgroundColor, foregroundColor] = useThemeColor(['background', 'foreground']);

  return (
    <DesktopPairingProvider>
      <Stack
        screenOptions={{
          ...headerScreenOptions,
          headerStyle: getRootHeaderStyle(backgroundColor),
          headerTransparent: isLiquidGlassAvailable,
          headerTintColor: foregroundColor,
        }}
      />
    </DesktopPairingProvider>
  );
}
