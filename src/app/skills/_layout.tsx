import { Stack } from 'expo-router';

import { headerScreenOptions } from '@/frontend/appShell/header';
import { FormContentFrame } from '@/frontend/appShell/layout';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

export default function SkillsStackLayout() {
  const foreground = useThemeColor('foreground');
  const background = useThemeColor('background');

  return (
    <Stack
      screenLayout={FormContentFrame}
      screenOptions={{
        ...headerScreenOptions,
        headerTransparent: false,
        headerTintColor: foreground,
        contentStyle: { backgroundColor: background },
      }}
    />
  );
}
