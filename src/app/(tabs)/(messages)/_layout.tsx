import { Stack } from 'expo-router';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isIOS, isLiquidGlassAvailable } from '@/frontend/utils/constants';

export default function MessagesStackLayout() {
  const foregroundColor = useThemeColor('foreground');

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: isIOS ? undefined : false,
        headerShown: isIOS,
        headerTransparent: isLiquidGlassAvailable,
        headerTintColor: foregroundColor,
      }}
    />
  );
}
