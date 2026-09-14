import { Stack } from 'expo-router';

import { headerScreenOptions } from '@/frontend/appShell/header';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

export default function PluginsStackLayout() {
  const foreground = useThemeColor('foreground');
  const background = useThemeColor('background');
  return (
    <Stack
      screenOptions={{
        ...headerScreenOptions,
        headerTransparent: false,
        headerTintColor: foreground,
        contentStyle: { backgroundColor: background },
      }}
    >
      <Stack.Screen
        name="[pluginId]/callback"
        options={{ animation: 'none', headerShown: false }}
      />
    </Stack>
  );
}
