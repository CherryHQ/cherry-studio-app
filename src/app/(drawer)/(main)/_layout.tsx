import { Stack } from 'expo-router';

import { headerScreenOptions, RouteHeaderProvider } from '@/frontend/appShell/header';
import { useCanDockSidebar } from '@/frontend/appShell/layout';
import { getRootHeaderStyle, paintingRouteId } from '@/frontend/appShell/navigation';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

// Every other destination sits above the chat, so leaving one always lands in a conversation.
export const unstable_settings = { initialRouteName: '(chat)' };

/**
 * The content region beside the sidebar. In a wide window the sidebar stays beside every page here,
 * so its first-level destinations replace one another without a back step or push animation and
 * lead with the button that hides or shows the sidebar; a compact window pushes the same pages over
 * the chat. One tree serves both, so crossing between them keeps every page mounted.
 */
export default function MainStackLayout() {
  const [backgroundColor, foregroundColor] = useThemeColor(['background', 'foreground']);
  const canDockSidebar = useCanDockSidebar();
  // Opened from the sidebar, a first-level page swaps in place; deeper pages still push.
  const destination = {
    animation: canDockSidebar ? ('none' as const) : undefined,
    gestureEnabled: !canDockSidebar,
    headerShown: false,
  };

  return (
    <RouteHeaderProvider rootAction={canDockSidebar ? 'drawer' : 'back'}>
      <Stack
        screenOptions={{
          ...headerScreenOptions,
          headerStyle: getRootHeaderStyle(backgroundColor),
          headerTransparent: isLiquidGlassAvailable,
          headerTintColor: foregroundColor,
        }}
      >
        <Stack.Screen name="(chat)" options={{ headerShown: false }} />
        <Stack.Screen name="agents" options={destination} />
        <Stack.Screen name="drawings" options={destination} />
        <Stack.Screen name="plugins" options={destination} />
        <Stack.Screen name="skills" options={destination} />
        <Stack.Screen name="library" options={destination} />
        {/* Settings owns a nested stack and draws its headers there. */}
        <Stack.Screen name="settings" options={destination} />
        <Stack.Screen name="trash" />
        <Stack.Screen
          // Task notifications reuse their task; each new draft owns its own page.
          getId={({ params }) => paintingRouteId(params)}
          name="paintings/index"
          options={{
            // Keep the full-bleed board's native canvas in sync with the app theme.
            contentStyle: { backgroundColor },
            headerStyle: { backgroundColor: 'transparent' },
            headerTransparent: true,
            title: '',
          }}
        />
        {/* Released task links and viewer routes redirect into the board. */}
        <Stack.Screen
          name="paintings/[paintingId]"
          options={{ contentStyle: { backgroundColor }, headerShown: false }}
        />
        <Stack.Screen
          name="paintings/[paintingId]/conversation"
          options={{ contentStyle: { backgroundColor }, headerShown: false }}
        />
      </Stack>
    </RouteHeaderProvider>
  );
}
