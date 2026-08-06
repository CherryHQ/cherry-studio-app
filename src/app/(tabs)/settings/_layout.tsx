import { Stack } from 'expo-router';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isIOS } from '@/frontend/utils/constants';

export default function SettingsStackLayout() {
  const foregroundColor = useThemeColor('foreground');

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: isIOS ? undefined : false,
        headerTransparent: false,
        headerTintColor: foregroundColor,
      }}
    >
      {/* Settings root renders its own animated profile hero + sticky bar
          (headerShown:false). Declared here at the layout level — not via a
          runtime <Stack.Screen> inside the screen — so the native header never
          flashes on first frame. Sub-screens keep the native header. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
