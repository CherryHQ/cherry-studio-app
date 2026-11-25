import { Stack, useNavigation } from 'expo-router';
import { View } from 'react-native';

import { headerScreenOptions, RouteHeaderProvider } from '@/frontend/appShell/header';
import { getRootHeaderStyle, paintingRouteId } from '@/frontend/appShell/navigation';
import {
  FloatingDragOverlay,
  FloatingNavDock,
  NAV_ROUTE_MANIFEST,
  NavPinPopover,
  useNavigationShell,
  useRegisterMainNavigator,
  VerticalNavRail,
} from '@/frontend/appShell/navigationShell';
import { OverlaySidebarPresenceProvider } from '@/frontend/appShell/sidebar';
import { ChatProvider } from '@/frontend/features/chat/runtime';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

// Every other destination sits above the chat, so leaving one always lands in a conversation.
export const unstable_settings = { initialRouteName: '(chat)' };

/**
 * The content region beside the sidebar and navigation rail.
 * Each nested stack binds its own root leading behavior via `NavRouteHeaderScope`;
 * `(main)` falls back to `back` for direct leaf children such as `trash` and `paintings`.
 */
export default function MainStackLayout() {
  const [backgroundColor, foregroundColor] = useThemeColor(['background', 'foreground']);
  const navigation = useNavigation();
  const { pinnedTabs, shellMode } = useNavigationShell();
  useRegisterMainNavigator(navigation);

  const isWideRail = shellMode === 'wide-rail';
  const railOrPinnedDestination = {
    animation: 'none' as const,
    gestureEnabled: false,
    headerShown: false,
  };

  const moduleDestination = (pinId: (typeof pinnedTabs)[number]) => {
    const isPinnedOnCompact = !isWideRail && pinnedTabs.includes(pinId);
    if (isWideRail || isPinnedOnCompact) {
      return railOrPinnedDestination;
    }
    return {
      gestureEnabled: true,
      headerShown: false,
    };
  };

  return (
    <OverlaySidebarPresenceProvider>
      <ChatProvider>
        <RouteHeaderProvider rootAction="back">
          <View className="flex-1 bg-background">
            <Stack
              screenOptions={{
                ...headerScreenOptions,
                contentStyle: { backgroundColor },
                headerStyle: getRootHeaderStyle(backgroundColor),
                headerTransparent: isLiquidGlassAvailable,
                headerTintColor: foregroundColor,
              }}
            >
              <Stack.Screen
                name={NAV_ROUTE_MANIFEST.chat.stackRoute}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name={NAV_ROUTE_MANIFEST.agents.stackRoute}
                options={moduleDestination('agents')}
              />
              <Stack.Screen
                name={NAV_ROUTE_MANIFEST.drawings.stackRoute}
                options={moduleDestination('drawings')}
              />
              <Stack.Screen
                name={NAV_ROUTE_MANIFEST.plugins.stackRoute}
                options={moduleDestination('plugins')}
              />
              <Stack.Screen
                name={NAV_ROUTE_MANIFEST.marketplace.stackRoute}
                options={moduleDestination('marketplace')}
              />
              <Stack.Screen
                name={NAV_ROUTE_MANIFEST.files.stackRoute}
                options={moduleDestination('files')}
              />
              <Stack.Screen
                name={NAV_ROUTE_MANIFEST.devices.stackRoute}
                options={moduleDestination('devices')}
              />
              <Stack.Screen
                name={NAV_ROUTE_MANIFEST.more.stackRoute}
                options={railOrPinnedDestination}
              />
              <Stack.Screen name="scheduled-tasks" options={railOrPinnedDestination} />
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
            <FloatingNavDock />
            <VerticalNavRail />
            <NavPinPopover />
            <FloatingDragOverlay />
          </View>
        </RouteHeaderProvider>
      </ChatProvider>
    </OverlaySidebarPresenceProvider>
  );
}
