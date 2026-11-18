import { Stack } from 'expo-router';

import { headerScreenOptions } from '@/frontend/appShell/header';
import { FormContentFrame } from '@/frontend/appShell/layout';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

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
    >
      <Stack.Screen name="index" />
      <Stack.Screen
        name="templates/[templateId]"
        getId={({ params }) =>
          `${getSingleRouteParam(params?.templateId)}:${getSingleRouteParam(params?.templateLanguage)}`
        }
      />
    </Stack>
  );
}
