import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import MousePointerClickIcon from '@cherrystudio/app-icons/icons/mouse-pointer-click';
import PaletteIcon from '@cherrystudio/app-icons/icons/palette';
import SearchIcon from '@cherrystudio/app-icons/icons/search';
import { ContextMenuScrollBoundary, ScrollShadow } from '@cherrystudio/ui/components';
import { type PropsWithChildren, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { appSidebar } from '@/frontend/utils/constants';

import { useSidebarActions } from '../context';
import { useDockMetrics } from '../hooks/useDockMetrics';
import { SidebarNavRow } from './SidebarNavRow';
import { SidebarRecents } from './SidebarRecents';

type RegisterEndReachedHandler = (handler?: () => void) => void;

const endReachedThreshold = 24;

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
  const endReachedHandlerRef = useRef<(() => void) | undefined>(undefined);
  const wasNearEndRef = useRef(false);
  const registerEndReachedHandler = useCallback<RegisterEndReachedHandler>((handler) => {
    endReachedHandlerRef.current = handler;
  }, []);
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromEnd = contentSize.height - layoutMeasurement.height - contentOffset.y;
    const isNearEnd = distanceFromEnd <= endReachedThreshold;

    if (isNearEnd && !wasNearEndRef.current) {
      endReachedHandlerRef.current?.();
    }
    wasNearEndRef.current = isNearEnd;
  }, []);

  return (
    <View className="flex-1">
      <ScrollShadow className="flex-1" color={backgroundColor} size={headerInset} visibility="top">
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
              onScroll={handleScroll}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
            >
              {children ?? (
                <SidebarBodyDefault registerEndReachedHandler={registerEndReachedHandler} />
              )}
            </ScrollView>
          )}
        </ContextMenuScrollBoundary>
      </ScrollShadow>
    </View>
  );
}

SidebarBody.displayName = 'Sidebar.Body';

function SidebarBodyDefault({
  registerEndReachedHandler,
}: {
  registerEndReachedHandler: RegisterEndReachedHandler;
}) {
  const { t } = useTranslation();
  const { navigateAgents, openLibrary, openPaintings, openSearch } =
    useSidebarActions('Sidebar.Body');

  return (
    <>
      <View className="px-5 pb-3">
        <Pressable
          accessibilityLabel={t('session.search.placeholder')}
          accessibilityRole="button"
          className="min-h-11 flex-row items-center gap-2 rounded-xl bg-secondary px-3 active:bg-sidebar-accent"
          onPress={openSearch}
          testID="sidebar-search"
        >
          <SearchIcon className="size-4 text-muted-foreground" />
          <Text className="text-base text-muted-foreground">{t('session.search.placeholder')}</Text>
        </Pressable>
      </View>
      {/* No home row: that surface moves under settings. */}
      <View className="pb-1">
        <SidebarNavRow
          icon={FolderIcon}
          label={t('navigation.library')}
          onPress={openLibrary}
          testID="sidebar-library"
        />
        <SidebarNavRow
          icon={MousePointerClickIcon}
          label={t('navigation.agents')}
          onPress={navigateAgents}
          testID="sidebar-agents"
        />
        <SidebarNavRow
          icon={PaletteIcon}
          label={t('navigation.paintings')}
          onPress={openPaintings}
          testID="sidebar-paintings"
        />
      </View>

      <SidebarRecents registerEndReachedHandler={registerEndReachedHandler} />
    </>
  );
}
