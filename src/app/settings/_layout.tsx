import { Stack } from 'expo-router';

import { headerScreenOptions } from '@/frontend/appShell/header';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

export default function SettingsStackLayout() {
  const foregroundColor = useThemeColor('foreground');

  return (
    <Stack
      screenOptions={{
        ...headerScreenOptions,
        headerTransparent: false,
        headerTintColor: foregroundColor,
      }}
    >
      <Stack.Screen name="index" options={{ title: '' }} />
    </Stack>
  );
}
