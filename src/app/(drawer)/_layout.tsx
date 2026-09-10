import { type DrawerContentComponentProps, Drawer } from 'expo-router/drawer';
import { getCornerRadiusSync } from 'expo-screen-corner-radius';
import { useWindowDimensions } from 'react-native';
import type { PanGesture } from 'react-native-gesture-handler';

import { RouteHeaderProvider } from '@/frontend/appShell/header';
import { Sidebar } from '@/frontend/appShell/sidebar';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { appSidebar } from '@/frontend/utils/constants';

// Keep a stable render callback and render Sidebar as a component so React owns
// its hook lifecycle.
function renderSidebar(props: DrawerContentComponentProps) {
  return <Sidebar navigation={props.navigation} />;
}

// Module-level so the drawer's memoized pan gesture is not rebuilt per render.
// The swipe commits after native horizontal scroll surfaces in chat have had
// their chance to claim the touch (see appSidebar.swipeActivationDistance). The
// vertical fail distance scales with it so the accepted swipe angle stays the
// same as the library default; vertical intent is already claimed earlier by
// the message list.
function configureDrawerGesture(gesture: PanGesture) {
  const distance = appSidebar.swipeActivationDistance;
  return gesture.activeOffsetX([-distance, distance]).failOffsetY([-distance, distance]);
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
          configureGestureHandler: configureDrawerGesture,
          // The sidebar stops short of the right edge so a dimmed strip of chat
          // stays visible: it tells the user where they came from and closes the
          // drawer on tap.
          drawerStyle: { width: width - appSidebar.sceneRevealWidth },
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
