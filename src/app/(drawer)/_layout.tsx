import { BottomSheetBoundsProvider } from '@cherrystudio/ui/components';
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ChatDockLayoutProvider,
  FoldRegionProvider,
  useCanDockSidebar,
  WindowFoldRegion,
} from '@/frontend/appShell/layout';
import { FirstUseGate } from '@/frontend/appShell/navigation';
import { ChatSourceProvider } from '@/frontend/appShell/navigation/chat';
import {
  NAV_ROUTE_MANIFEST,
  NavigationShellProvider,
  useNavigationShell,
  WIDE_RAIL_WIDTH,
  WideNavRail,
} from '@/frontend/appShell/navigationShell';
import {
  DockedSidebar,
  SidebarColumnProvider,
  SidebarToggleProvider,
} from '@/frontend/appShell/sidebar';
import { AppSearchPanel } from '@/frontend/features/search';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

export const unstable_settings = { initialRouteName: '(content)' };

export default function DrawerLayout() {
  return (
    <FirstUseGate>
      <ChatSourceProvider>
        <FoldRegionProvider>
          <WindowFoldRegion>
            <NavigationShellProvider>
              <DrawerShell />
            </NavigationShellProvider>
          </WindowFoldRegion>
        </FoldRegionProvider>
      </ChatSourceProvider>
    </FirstUseGate>
  );
}

function DrawerShell() {
  const outerInsets = useSafeAreaInsets();
  const { middleColumnWidth, shellMode } = useNavigationShell();
  const canDock = useCanDockSidebar();
  const isWide = shellMode === 'wide-rail';
  const backgroundColor = useThemeColor('background');

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
                  <View className="flex-1 flex-row">
                    {canDock ? <DockedSidebar searchPanel={AppSearchPanel} /> : null}
                    <View className="min-w-0 flex-1">
                      <Stack
                        screenOptions={{ headerShown: false, contentStyle: { backgroundColor } }}
                      >
                        <Stack.Screen name="(content)" />
                        <Stack.Screen
                          name={NAV_ROUTE_MANIFEST.settings.stackRoute}
                          options={
                            isWide
                              ? { animation: 'none', gestureEnabled: false, headerShown: false }
                              : { gestureEnabled: true, headerShown: false }
                          }
                        />
                      </Stack>
                    </View>
                  </View>
                </SidebarToggleProvider>
              </ChatDockLayoutProvider>
            </SidebarColumnProvider>
          </BottomSheetBoundsProvider>
        </SafeAreaInsetsContext>
      </View>
    </View>
  );
}
