import FilterIcon from '@cherrystudio/app-icons/icons/filter';
import ImagesIcon from '@cherrystudio/app-icons/icons/images';
import UsersRoundIcon from '@cherrystudio/app-icons/icons/users-round';
import { ScrollShadow } from '@cherrystudio/ui/components';
import type { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { appSidebar } from '@/frontend/utils/constants';

import { useSidebarActions } from '../context';
import { useSidebarFadeStyle } from '../sidebarMotion';
import { useDockMetrics } from '../useDockMetrics';
import { SidebarNavRow } from './SidebarNavRow';
import { SidebarTopicList } from './SidebarTopicList';

/**
 * Fading middle plane, and the sidebar's only scroller: nav rows and the recent
 * topics scroll together under the floating header and footer, which is why the
 * content padding clears both. `ScrollShadow` dissolves rows into the sidebar
 * surface at both ends (it takes one `size` for the pair, so the two ends share
 * a depth); the blur that goes with it lives in the header's and footer's own
 * `SidebarFade`. Children replace the default composition wholesale.
 */
export function SidebarBody({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  const fadeStyle = useSidebarFadeStyle();
  const sidebarColor = useThemeColor('sidebar');
  const { bottomPadding: dockBottomPadding } = useDockMetrics();
  const headerInset = insets.top + appSidebar.headerRowHeight + appSidebar.headerGapY * 2;

  return (
    <Animated.View className="flex-1" style={fadeStyle}>
      <ScrollShadow className="flex-1" color={sidebarColor} size={appSidebar.scrollShadowSize}>
        <ScrollView
          contentContainerStyle={{
            // Clears the whole floating dock, whose own bottom padding is
            // concentric with the display's corners rather than a fixed inset.
            paddingBottom: dockBottomPadding + appSidebar.dockHeight + appSidebar.headerGapY,
            paddingTop: headerInset,
          }}
          contentInsetAdjustmentBehavior="never"
          showsVerticalScrollIndicator={false}
        >
          {children ?? <SidebarBodyDefault />}
        </ScrollView>
      </ScrollShadow>
    </Animated.View>
  );
}

SidebarBody.displayName = 'Sidebar.Body';

function SidebarBodyDefault() {
  const { t } = useTranslation();
  const { navigateAssistants, openPaintings } = useSidebarActions('Sidebar.Body');

  return (
    <>
      {/* No home row: that surface moves under settings. */}
      <View className="pb-1">
        <SidebarNavRow
          icon={UsersRoundIcon}
          label={t('navigation.assistants')}
          onPress={navigateAssistants}
        />
        <SidebarNavRow
          icon={ImagesIcon}
          label={t('navigation.paintings')}
          onPress={openPaintings}
        />
      </View>

      <View className="flex-row items-center justify-between px-5 pt-4 pb-1">
        <Text className="font-medium text-muted-foreground text-sm">{t('navigation.recents')}</Text>
        {/* Icon only, no surface: it sits on the section label's baseline, and a
            chip there would outweigh the label it belongs to. Filtering itself
            is not wired up yet. */}
        <Pressable
          accessibilityLabel={t('navigation.filterChats')}
          accessibilityRole="button"
          className="-mr-1 p-1 active:opacity-60"
          hitSlop={8}
        >
          <FilterIcon className="size-4 text-muted-foreground" />
        </Pressable>
      </View>
      <SidebarTopicList />
    </>
  );
}
