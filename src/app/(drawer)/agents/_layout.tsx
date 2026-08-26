import { Stack } from 'expo-router';

import { headerScreenOptions } from '@/frontend/components/headers';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

export default function AgentsStackLayout() {
  const foregroundColor = useThemeColor('foreground');

  // Every screen here keeps the ordinary page background. The editor used to be
  // a grouped-card screen, which needs the gray page for its white cards to sit
  // on; it now draws bare fields, and those need the page to stay lighter than
  // the field fill or the outlines are all that separate them.
  return (
    <Stack
      screenOptions={{
        ...headerScreenOptions,
        headerTransparent: isLiquidGlassAvailable,
        headerTintColor: foregroundColor,
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
