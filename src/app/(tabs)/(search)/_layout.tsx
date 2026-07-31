import { Stack } from 'expo-router';
import { useThemeColor } from 'heroui-native/hooks';

import { isIOS, isLiquidGlassAvailable } from '@/frontend/utils/constants';

export default function SearchStackLayout() {
  const foregroundColor = useThemeColor('foreground');

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: isIOS ? undefined : false,
        headerTransparent: isLiquidGlassAvailable,
        headerTintColor: foregroundColor,
      }}
    />
  );
}
