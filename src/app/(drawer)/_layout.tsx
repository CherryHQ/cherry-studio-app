import { BottomSheetBoundsProvider } from '@cherrystudio/ui/components';
import { usePathname } from 'expo-router';
import { type DrawerContentComponentProps, Drawer } from 'expo-router/drawer';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import type { LegacyPanGesture } from 'react-native-gesture-handler';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

import {
  ChatDockLayoutProvider,
  FoldRegionProvider,
  useCanDockSidebar,
  WindowFoldRegion,
} from '@/frontend/appShell/layout';
import { ChatSourceProvider } from '@/frontend/appShell/navigation/chat';
import {
  NavigationShellProvider,
  resolveCompactLeadingAction,
  useNavigationShell,
  useNavigationShellInteraction,
  WIDE_RAIL_WIDTH,
  WideNavRail,
} from '@/frontend/appShell/navigationShell';
import {
  resolveSidebarDrawer,
  Sidebar,
  SidebarColumnProvider,
  SidebarToggleProvider,
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

export default function DrawerLayout() {
  return (
    <ChatSourceProvider>
      <FoldRegionProvider>
        <WindowFoldRegion>
          <NavigationShellProvider>
            <DrawerShell />
          </NavigationShellProvider>
        </WindowFoldRegion>
      </FoldRegionProvider>
    </ChatSourceProvider>
  );
}

function DrawerShell() {
  const outerInsets = useSafeAreaInsets();
  const { middleColumnWidth, shellMode } = useNavigationShell();

  const contentInsets = {
    ...outerInsets,
    left: shellMode === 'wide-rail' ? 0 : outerInsets.left,
    right: outerInsets.right,
  };
  const sheetInsetLeft =
    shellMode === 'wide-rail'
      ? outerInsets.left + WIDE_RAIL_WIDTH + middleColumnWidth
      : outerInsets.left;
  const sheetInsetRight = outerInsets.right;

  return (
    <View className="flex-1 flex-row">
      {shellMode === 'wide-rail' ? <WideNavRail /> : null}
      <View className="min-w-0 flex-1">
        <SafeAreaInsetsContext value={contentInsets}>
          <BottomSheetBoundsProvider insetLeft={sheetInsetLeft} insetRight={sheetInsetRight}>
            <SidebarColumnProvider>
              <ChatDockLayoutProvider>
                <SidebarToggleProvider>
                  <SidebarDrawer />
                </SidebarToggleProvider>
              </ChatDockLayoutProvider>
            </SidebarColumnProvider>
          </BottomSheetBoundsProvider>
        </SafeAreaInsetsContext>
      </View>
    </View>
  );
}

function SidebarDrawer() {
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
  const overlayWidth = Math.min(
    appSidebar.maxWidth,
    Math.max(280, width - Math.max(appSidebar.sceneRevealWidth, outerInsets.right)),
  );
  const { drawerType, drawerStyle } = resolveSidebarDrawer(column, overlayWidth, canDock);
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
