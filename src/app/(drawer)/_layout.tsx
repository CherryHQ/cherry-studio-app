import { type DrawerContentComponentProps, Drawer } from 'expo-router/drawer';
import { getCornerRadiusSync } from 'expo-screen-corner-radius';
import { useWindowDimensions } from 'react-native';

import { RouteHeaderProvider } from '@/frontend/components/headers';
import { Sidebar } from '@/frontend/features/sidebar';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { appSidebar } from '@/frontend/utils/constants';

// Must return an element, NOT be `Sidebar` itself: `DrawerView` *calls*
// `drawerContent(props)` rather than rendering it, so passing the component
// directly runs its hooks in the caller's context — outside the drawer's
// progress provider — and `useDrawerProgress()` throws "Couldn't find a
// drawer". Defined at module scope so it is also a stable reference.
function renderSidebar(props: DrawerContentComponentProps) {
  return <Sidebar navigation={props.navigation} />;
}

export const unstable_settings = {
  initialRouteName: '(chat)',
};

export default function DrawerLayout() {
  // Also re-reads the corner radius when a foldable switches displays.
  const { width } = useWindowDimensions();
  const [backgroundColor, overlayColor] = useThemeColor(['background', 'scrim']);

  return (
    <RouteHeaderProvider rootAction="drawer">
      <Drawer
        drawerContent={renderSidebar}
        screenOptions={{
          drawerStyle: { width: width * appSidebar.widthRatio },
          // Keep the routed screen in place and slide the sidebar over it. The
          // sidebar is a temporary surface and must not occupy scene layout space.
          drawerType: 'front',
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
        <Drawer.Screen name="(chat)" />
        <Drawer.Screen name="home" />
        <Drawer.Screen name="assistants" />
        <Drawer.Screen name="drawings" />
      </Drawer>
    </RouteHeaderProvider>
  );
}
