import { Stack } from 'expo-router';

import { getTransparentHeaderStyle } from '@/frontend/components/navigation/rootStackPlatform/rootStackPlatform';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

/**
 * Native-stack host for the chat surface. The drawer scene itself renders no
 * header; `MainHeader` drives this stack's toolbar and search-bar slots, which
 * only exist inside a native stack screen.
 */
export default function ChatStackLayout() {
  const foregroundColor = useThemeColor('foreground');

  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: 'transparent' },
        headerShadowVisible: false,
        headerStyle: getTransparentHeaderStyle(),
        headerTintColor: foregroundColor,
        headerTransparent: isLiquidGlassAvailable,
      }}
    />
  );
}
