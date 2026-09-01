import BotIcon from '@cherrystudio/app-icons/icons/bot';
import ImageIcon from '@cherrystudio/app-icons/icons/image';
import LibraryBigIcon from '@cherrystudio/app-icons/icons/library-big';
import { ContextMenuScrollBoundary, ScrollShadow } from '@cherrystudio/ui/components';
import type { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { appSidebar } from '@/frontend/utils/constants';

import { useSidebarActions } from '../context';
import { useDockMetrics } from '../useDockMetrics';
import { SidebarNavRow } from './SidebarNavRow';
import { SidebarRecents } from './SidebarRecents';

/**
 * The sidebar's only scroller: nav rows and the recent sessions scroll together
 * under the floating header and footer, which is why the content padding clears
 * both. `ScrollShadow` dissolves rows into the sidebar surface at the top, and
 * the header's blur lives in its `SidebarFade` layer. Children replace the
 * default composition wholesale.
 */
export function SidebarBody({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor('background');
  const { bottomPadding: dockBottomPadding } = useDockMetrics();
  const headerInset = insets.top + appSidebar.headerRowHeight + appSidebar.headerGapY * 2;

  return (
    <View className="flex-1">
      <ScrollShadow
        className="flex-1"
        color={backgroundColor}
        size={appSidebar.scrollShadowSize}
        visibility="top"
      >
        <ContextMenuScrollBoundary>
          {(scrollHandlers) => (
            <ScrollView
              {...scrollHandlers}
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
          )}
        </ContextMenuScrollBoundary>
      </ScrollShadow>
    </View>
  );
}

SidebarBody.displayName = 'Sidebar.Body';

function SidebarBodyDefault() {
  const { t } = useTranslation();
  const { navigateAgents, openLibrary, openPaintings } = useSidebarActions('Sidebar.Body');

  return (
    <>
      {/* No home row: that surface moves under settings. */}
      <View className="pb-1">
        <SidebarNavRow
          icon={LibraryBigIcon}
          label={t('navigation.library')}
          onPress={openLibrary}
        />
        <SidebarNavRow icon={BotIcon} label={t('navigation.agents')} onPress={navigateAgents} />
        <SidebarNavRow icon={ImageIcon} label={t('navigation.paintings')} onPress={openPaintings} />
      </View>

      <SidebarRecents />
    </>
  );
}
