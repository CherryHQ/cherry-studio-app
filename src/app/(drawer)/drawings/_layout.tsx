import { Stack } from 'expo-router';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

// The drawings history is a drawer scene, so it leads with a hamburger rather
// than a back button — which means it needs its own nested stack for the native
// `Stack.Toolbar` its Edit control uses. Creating and viewing paintings stays
// on the root stack (`/paintings`, `/paintings/[paintingId]`): those are
// full-screen flows reached from chat too, not drawer destinations.
export default function DrawingsStackLayout() {
  const foregroundColor = useThemeColor('foreground');

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerTransparent: isLiquidGlassAvailable,
        headerTintColor: foregroundColor,
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
