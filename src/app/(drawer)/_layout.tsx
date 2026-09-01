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
          // The chat surface is stable context; the sidebar is a temporary
          // surface that slides over it as the only moving plane.
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
          // Only chat belongs to this navigator, so the full-width gesture can
          // never expose the sidebar over another product screen.
          swipeEdgeWidth: width,
        }}
      >
        <Drawer.Screen name="(chat)" />
      </Drawer>
    </RouteHeaderProvider>
  );
}
