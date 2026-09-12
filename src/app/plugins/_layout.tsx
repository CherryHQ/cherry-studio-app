import { Stack } from 'expo-router';

import { headerScreenOptions } from '@/frontend/appShell/header';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

export default function PluginsStackLayout() {
  const foreground = useThemeColor('foreground');
  return (
    <Stack
      screenOptions={{
        ...headerScreenOptions,
        headerTransparent: false,
        headerTintColor: foreground,
      }}
    />
  );
}
