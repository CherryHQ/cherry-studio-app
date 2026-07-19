import { Stack } from 'expo-router';
import { useThemeColor } from 'heroui-native/hooks';

import { isIOS, isLiquidGlassAvailable } from '@/config/constants';

export default function HomeStackLayout() {
  const foregroundColor = useThemeColor('foreground');

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: isIOS ? undefined : false,
        headerTransparent: isLiquidGlassAvailable,
        headerTintColor: foregroundColor,
      }}
    >
      {/* Home root renders its own animated sticky header (headerShown:false).
          Declared here at the layout level — not via a runtime <Stack.Screen>
          inside the screen — so the native header never flashes on first frame. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
