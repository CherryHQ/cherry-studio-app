import { Stack, useNavigation, usePathname } from 'expo-router';
import { View } from 'react-native';

import { headerScreenOptions, RouteHeaderProvider } from '@/frontend/appShell/header';
import { getRootHeaderStyle, paintingRouteId } from '@/frontend/appShell/navigation';
import {
  FloatingDragOverlay,
  FloatingNavDock,
  NavPinPopover,
  resolveCompactLeadingAction,
  useNavigationShell,
  useRegisterMainNavigator,
} from '@/frontend/appShell/navigationShell';
import { ChatProvider } from '@/frontend/features/chat/runtime';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

// Every other destination sits above the chat, so leaving one always lands in a conversation.
export const unstable_settings = { initialRouteName: '(chat)' };

/**
 * The content region beside the sidebar and navigation rail.
 * Wide mode hides the left hamburger on non-chat roots (using `none`) because the permanent
 * left rail handles primary navigation; compact mode keeps `drawer` on chat, 「更多」, and
 * pinned roots, while unpinned modules opened from 「更多」 lead with `back`.
 */
export default function MainStackLayout() {
  const [backgroundColor, foregroundColor] = useThemeColor(['background', 'foreground']);
  const navigation = useNavigation();
  const pathname = usePathname();
  const { activeDestination, pinnedTabs, shellMode } = useNavigationShell();
  useRegisterMainNavigator(navigation);

  const isWideRail = shellMode === 'wide-rail';
  const rootAction = isWideRail
    ? activeDestination === 'chat'
      ? 'drawer'
      : 'none'
    : resolveCompactLeadingAction(pathname, pinnedTabs);

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
    <ChatProvider>
      <RouteHeaderProvider rootAction={rootAction}>
        <View className="flex-1">
          <Stack
            screenOptions={{
              ...headerScreenOptions,
              headerStyle: getRootHeaderStyle(backgroundColor),
              headerTransparent: isLiquidGlassAvailable,
              headerTintColor: foregroundColor,
            }}
          >
            <Stack.Screen name="(chat)" options={{ headerShown: false }} />
            <Stack.Screen name="agents" options={moduleDestination('agents')} />
            <Stack.Screen name="drawings" options={moduleDestination('drawings')} />
            <Stack.Screen name="plugins" options={moduleDestination('plugins')} />
            <Stack.Screen name="skills" options={moduleDestination('marketplace')} />
            <Stack.Screen name="library" options={moduleDestination('files')} />
            <Stack.Screen name="devices" options={moduleDestination('devices')} />
            <Stack.Screen name="more" options={railOrPinnedDestination} />
            <Stack.Screen name="scheduled-tasks" options={railOrPinnedDestination} />
            {/* Settings owns a nested stack and draws its headers there. */}
            <Stack.Screen
              name="settings"
              options={
                isWideRail ? railOrPinnedDestination : { gestureEnabled: true, headerShown: false }
              }
            />
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
          <NavPinPopover />
          <FloatingDragOverlay />
        </View>
      </RouteHeaderProvider>
    </ChatProvider>
  );
}
