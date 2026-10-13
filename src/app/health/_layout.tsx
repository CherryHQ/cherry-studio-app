import { Stack } from 'expo-router';

import { headerScreenOptions } from '@/frontend/appShell/header';
import { FormContentFrame } from '@/frontend/appShell/layout';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

export default function HealthStackLayout() {
  const foregroundColor = useThemeColor('foreground');
  return (
    <Stack
      screenLayout={FormContentFrame}
      screenOptions={{
        ...headerScreenOptions,
        headerTransparent: false,
        headerTintColor: foregroundColor,
      }}
    />
  );
}
