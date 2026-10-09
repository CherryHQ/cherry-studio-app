import { Stack } from 'expo-router';

import { headerScreenOptions } from '@/frontend/appShell/header';
import { FormContentFrame } from '@/frontend/appShell/layout';
import { DesktopPairingProvider } from '@/frontend/features/settings/DeviceConnectionsScreen';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

export default function OnboardingLayout() {
  const foregroundColor = useThemeColor('foreground');

  return (
    <DesktopPairingProvider>
      <Stack
        screenLayout={FormContentFrame}
        screenOptions={{
          ...headerScreenOptions,
          headerTintColor: foregroundColor,
          headerTransparent: false,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
      </Stack>
    </DesktopPairingProvider>
  );
}
