import { Stack } from 'expo-router';

import { mainHeaderScreenOptions, RouteHeaderProvider } from '@/frontend/appShell/header';
import { getTransparentHeaderStyle } from '@/frontend/appShell/navigation';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

/**
 * Native-stack host for the chat surface. The drawer scene itself renders no
 * header; `MainHeader` drives this stack's toolbar and search-bar slots, which
 * only exist inside a native stack screen. The header module decides whether that
 * native header exists, and the route declares it here so the first frame already
 * has the right one.
 */
export default function ChatStackLayout() {
  const [foregroundColor, chatBackgroundColor] = useThemeColor(['foreground', 'chat-background']);

  return (
    <RouteHeaderProvider rootAction="drawer">
      <Stack
        screenOptions={{
          ...mainHeaderScreenOptions,
          contentStyle: { backgroundColor: chatBackgroundColor },
          headerStyle: getTransparentHeaderStyle(),
          headerTintColor: foregroundColor,
        }}
      />
    </RouteHeaderProvider>
  );
}
