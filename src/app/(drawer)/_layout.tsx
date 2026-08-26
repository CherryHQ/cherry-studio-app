import { type DrawerContentComponentProps, Drawer } from 'expo-router/drawer';
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
        <Drawer.Screen name="(chat)" />
        <Drawer.Screen name="home" />
        <Drawer.Screen name="library" />
        <Drawer.Screen name="agents" />
        <Drawer.Screen name="drawings" />
      </Drawer>
    </RouteHeaderProvider>
  );
}
