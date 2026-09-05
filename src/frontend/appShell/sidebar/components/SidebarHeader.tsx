import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appSidebar } from '@/frontend/utils/constants';

import { SidebarFade } from './SidebarFade/SidebarFade';

/**
 * Brand row floating over the body, which scrolls underneath it. The blur band
 * dissolves rows as they rise past the title instead of cutting them at a hard
 * edge.
 *
 * `box-none` on the container: the band itself must not eat touches meant for
 * the rows underneath.
 */
export function SidebarHeader() {
  const insets = useSafeAreaInsets();

  return (
    <View className="absolute top-0 right-0 left-0" pointerEvents="box-none">
      <SidebarFade edge="top" size={appSidebar.headerBlurSize} />
      <View
        className="absolute right-0 left-0 flex-row items-center gap-2 px-5"
        style={{ height: appSidebar.headerRowHeight, top: insets.top + appSidebar.headerGapY }}
      >
        <Text className="flex-1 font-semibold text-2xl text-sidebar-foreground" numberOfLines={1}>
          Cherry Studio
        </Text>
      </View>
    </View>
  );
}

SidebarHeader.displayName = 'Sidebar.Header';
