import { Stack } from 'expo-router';
import { useThemeColor } from 'heroui-native/hooks';

import { isIOS, isLiquidGlassAvailable } from '@/utils/constants';

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
