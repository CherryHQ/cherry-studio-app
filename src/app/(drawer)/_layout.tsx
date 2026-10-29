import { type DrawerContentComponentProps, Drawer } from 'expo-router/drawer';
import { StyleSheet, useWindowDimensions } from 'react-native';
import type { LegacyPanGesture } from 'react-native-gesture-handler';
import { useUniwind } from 'uniwind';

import {
  ChatDockLayoutProvider,
  FoldRegionProvider,
  WindowFoldRegion,
} from '@/frontend/appShell/layout';
import { ChatSourceProvider, useChatSource } from '@/frontend/appShell/navigation/chat';
import { FilePaneProvider } from '@/frontend/appShell/pane';
import {
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
        <FilePaneProvider>
          <SidebarColumnProvider>
            <ChatDockLayoutProvider>
              <WindowFoldRegion>
                <SidebarToggleProvider>
                  <SidebarDrawer />
                </SidebarToggleProvider>
              </WindowFoldRegion>
            </ChatDockLayoutProvider>
          </SidebarColumnProvider>
        </FilePaneProvider>
      </FoldRegionProvider>
    </ChatSourceProvider>
  );
}

function SidebarDrawer() {
  const { width } = useWindowDimensions();
  const { theme } = useUniwind();
  const { column } = useSidebarColumn();
  const { isChatFocused } = useChatSource();
  const [backgroundColor, sidebarColor, sidebarBorderColor, overlayColor] = useThemeColor([
    'background',
    'sidebar',
    'sidebar-border',
    'scrim',
  ]);
  const isPermanent = column.kind === 'permanent';

  return (
    <Drawer
      drawerContent={renderSidebar}
      screenOptions={{
        configureGestureHandler: configureDrawerGesture,
        // An overlay stops short of the right edge so a dimmed strip of chat stays
        // visible: it tells the user where they came from and closes the drawer on
        // tap. A permanent sidebar is a column of its own, separated by a hairline.
        drawerStyle: {
          backgroundColor: theme === 'dark' ? sidebarColor : backgroundColor,
          borderEndColor: sidebarBorderColor,
          borderEndWidth: isPermanent || theme === 'dark' ? StyleSheet.hairlineWidth : 0,
          width: isPermanent
            ? column.width
            : Math.min(appSidebar.maxWidth, width - appSidebar.sceneRevealWidth),
        },
        // The content region is stable context. In compact windows the sidebar is a temporary
        // surface sliding over it; wide windows keep it beside every page until the file pane
        // takes its column or the user hides it. Switching keeps the same content tree mounted.
        drawerType: isPermanent ? 'permanent' : 'front',
        headerShown: false,
        // Dim the exposed scene while preserving the drawer's native progress
        // animation and tap-to-close interaction.
        overlayColor,
        sceneStyle: {
          // Keep the scene opaque where a screen leaves its own content style
          // transparent, including beneath the overlaid sidebar.
          backgroundColor,
          // The full-screen scene reaches every window edge. Let the display
          // handle physical corners without clipping the header's blur.
          overflow: 'hidden',
        },
        swipeEdgeWidth: width,
        // Pages pushed over the chat lead with back, so the full-width gesture only exposes the
        // overlay from the chat itself.
        swipeEnabled: column.kind === 'overlay' && isChatFocused,
      }}
    >
      <Drawer.Screen name="(main)" />
    </Drawer>
  );
}
