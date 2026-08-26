import { type DrawerContentComponentProps, Drawer } from 'expo-router/drawer';
import { getFocusedRouteNameFromRoute } from 'expo-router/react-navigation';
import { getCornerRadiusSync } from 'expo-screen-corner-radius';
import { useWindowDimensions } from 'react-native';

import { RouteHeaderProvider } from '@/frontend/components/headers';
import { Sidebar } from '@/frontend/features/sidebar';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { appSidebar } from '@/frontend/utils/constants';

// Keep a stable render callback and render Sidebar as a component so React owns
// its hook lifecycle.
function renderSidebar(props: DrawerContentComponentProps) {
  return <Sidebar navigation={props.navigation} />;
}

export const unstable_settings = {
  initialRouteName: '(chat)',
};

/**
 * The sidebar belongs to the screen the drawer action sits on — each nested
 * stack's root. A screen pushed above one shows a back button instead, and
 * because the swipe spans the full width it would otherwise uncover a sidebar
 * that screen offers no other way into, swallowing the back gesture doing it.
 *
 * React Navigation resolves this from the parent: an `options` function on the
 * drawer screen re-runs when the nested stack's focused route changes, which a
 * plain `screenOptions` object does not. `index` is Expo Router's name for a
 * directory's root route, and an uninitialized stack has no focused route yet.
 *
 * This asks which route is focused, while `RouteHeader` asks how deep the stack
 * is. The two agree everywhere except a deep link straight to a nested route,
 * where the stack holds one screen that is not `index`: the header offers the
 * drawer because there is nothing to go back to, but the swipe stays off.
 */
function stackRootSwipeOptions({
  route,
}: {
  route: Parameters<typeof getFocusedRouteNameFromRoute>[0];
}) {
  const focusedRouteName = getFocusedRouteNameFromRoute(route);

  return { swipeEnabled: focusedRouteName === undefined || focusedRouteName === 'index' };
}

export default function DrawerLayout() {
  // Also re-reads the corner radius when a foldable switches displays.
  const { width } = useWindowDimensions();
  const [backgroundColor, overlayColor] = useThemeColor(['background', 'scrim']);

  return (
    <RouteHeaderProvider rootAction="drawer">
      <Drawer
        drawerContent={renderSidebar}
        screenOptions={{
          drawerStyle: { width },
          drawerType: 'slide',
          headerShown: false,
          // Dim the exposed scene while preserving the drawer's native progress
          // animation and tap-to-close interaction.
          overlayColor,
          sceneStyle: {
            // Keep the scene opaque where a screen leaves its own content style
            // transparent, including beneath the overlaid sidebar.
            backgroundColor,
            // The device's own radius, so the surface is already screen-shaped at
            // rest and its corners disappear into the bezel.
            borderCurve: 'continuous',
            borderRadius: getCornerRadiusSync() ?? appSidebar.fallbackCornerRadius,
            overflow: 'hidden',
          },
          // Swipe anywhere, not just from the edge — matching ChatGPT. This is the
          // setting most likely to fight the chat screen's own gestures, so it is
          // the first thing to check on device.
          swipeEdgeWidth: width,
        }}
      >
        {/* Declared first on purpose: the first explicitly declared screen becomes
            the drawer's initial route, keeping cold start on the chat surface. */}
        <Drawer.Screen name="(chat)" options={stackRootSwipeOptions} />
        <Drawer.Screen name="home" options={stackRootSwipeOptions} />
        <Drawer.Screen name="library" options={stackRootSwipeOptions} />
        <Drawer.Screen name="agents" options={stackRootSwipeOptions} />
        <Drawer.Screen name="drawings" options={stackRootSwipeOptions} />
      </Drawer>
    </RouteHeaderProvider>
  );
}
