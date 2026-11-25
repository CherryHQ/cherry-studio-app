import { usePathname } from 'expo-router';
import { type DrawerContentComponentProps, Drawer } from 'expo-router/drawer';
import { StyleSheet, useWindowDimensions } from 'react-native';
import type { LegacyPanGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

import { useCanDockSidebar } from '@/frontend/appShell/layout';
import {
  resolveCompactLeadingAction,
  useNavigationShell,
  useNavigationShellInteraction,
} from '@/frontend/appShell/navigationShell';
import {
  resolveSidebarDrawer,
  resolveSidebarOverlayWidth,
  Sidebar,
  useSidebarColumn,
} from '@/frontend/appShell/sidebar';
import { AppSearchPanel } from '@/frontend/features/search';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { appSidebar } from '@/frontend/utils/constants';

// Keep a stable render callback and render Sidebar as a component so React owns
// its hook lifecycle.
function renderSidebar(props: DrawerContentComponentProps) {
  return <Sidebar navigation={props.navigation} searchPanel={AppSearchPanel} />;
}

// Module-level so the drawer's memoized pan gesture is not rebuilt per render.
// The swipe commits after native horizontal scroll surfaces in chat have had
// their chance to claim the touch (see appSidebar.swipeActivationDistance). The
// vertical fail distance scales with it so the accepted swipe angle stays the
// same as the library default; vertical intent is already claimed earlier by
// the message list.
function configureDrawerGesture(gesture: LegacyPanGesture) {
  const distance = appSidebar.swipeActivationDistance;
  return gesture.activeOffsetX([-distance, distance]).failOffsetY([-distance, distance]);
}

export default function SidebarDrawer() {
  const { width } = useWindowDimensions();
  const outerInsets = useSafeAreaInsets();
  const pathname = usePathname();
  const canDock = useCanDockSidebar();
  const { theme } = useUniwind();
  const { column } = useSidebarColumn();
  const { pinnedTabs, shellMode } = useNavigationShell();
  const { dragState } = useNavigationShellInteraction();
  const [backgroundColor, sidebarColor, sidebarBorderColor, overlayColor] = useThemeColor([
    'background',
    'sidebar',
    'sidebar-border',
    'scrim',
  ]);
  const overlayWidth = resolveSidebarOverlayWidth(width, outerInsets.right);
  const { drawerType, drawerStyle } = resolveSidebarDrawer(
    canDock ? { kind: 'inactive' } : column,
    overlayWidth,
    canDock,
  );
  const swipeEnabled =
    shellMode !== 'wide-rail' &&
    column.kind === 'overlay' &&
    resolveCompactLeadingAction(pathname, pinnedTabs) === 'drawer' &&
    !dragState;

  return (
    <Drawer
      drawerContent={renderSidebar}
      screenOptions={{
        configureGestureHandler: configureDrawerGesture,
        drawerStyle: {
          backgroundColor: theme === 'dark' ? sidebarColor : backgroundColor,
          borderEndColor: sidebarBorderColor,
          borderEndWidth: StyleSheet.hairlineWidth,
          ...drawerStyle,
        },
        drawerType,
        headerShown: false,
        overlayColor,
        sceneStyle: {
          backgroundColor,
          overflow: 'hidden',
        },
        swipeEdgeWidth: width,
        swipeEnabled,
        swipeMinDistance: 44,
      }}
    >
      <Drawer.Screen name="(main)" />
    </Drawer>
  );
}
