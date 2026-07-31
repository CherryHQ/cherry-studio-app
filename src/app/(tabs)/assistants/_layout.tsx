import { Stack } from 'expo-router';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { isIOS, isLiquidGlassAvailable } from '@/frontend/utils/constants';

export default function AssistantsStackLayout() {
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
