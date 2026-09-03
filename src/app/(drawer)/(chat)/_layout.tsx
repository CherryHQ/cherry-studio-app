import { Stack } from 'expo-router';

import { headerScreenOptions } from '@/frontend/appShell/header';
import { getTransparentHeaderStyle } from '@/frontend/appShell/navigation';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

/**
 * Native-stack host for the chat surface. The drawer scene itself renders no
 * header; `MainHeader` drives this stack's toolbar and search-bar slots, which
 * only exist inside a native stack screen.
 */
export default function ChatStackLayout() {
  const [foregroundColor, chatBackgroundColor] = useThemeColor(['foreground', 'chat-background']);

  return (
    <Stack
      screenOptions={{
        ...headerScreenOptions,
        contentStyle: { backgroundColor: chatBackgroundColor },
        headerStyle: getTransparentHeaderStyle(),
        headerTintColor: foregroundColor,
        headerTransparent: isLiquidGlassAvailable,
      }}
    />
  );
}
