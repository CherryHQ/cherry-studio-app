import ClockIcon from '@cherrystudio/app-icons/icons/clock';
import { ScrollInteractionBoundary, ScrollShadow } from '@cherrystudio/ui/components';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

import { useChatSource } from '@/frontend/appShell/navigation/chat';
import { useOptionalNavigationShell } from '@/frontend/appShell/navigationShell/state';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { appSidebar } from '@/frontend/utils/constants';

import { useSidebarActions } from '../context';
import { useDockMetrics } from '../hooks/useDockMetrics';
import { useSidebarDestination } from '../hooks/useSidebarDestination';
import { useSidebarHeaderTop } from '../hooks/useSidebarHeaderTop';
import { useSidebarSelection, useSidebarSelectionSnapshot } from '../SidebarSelectionProvider';
import { SidebarBranchScrollView } from './SidebarBranchScrollView';
import { SidebarNavRow } from './SidebarNavRow';
import { SidebarRecents } from './SidebarRecents';

type RegisterEndReachedHandler = (handler?: () => void) => void;

/**
 * The sidebar's only scroller: nav rows and the recent sessions scroll together
 * under the floating header and footer, which is why the content padding clears
 * both. `ScrollShadow` dissolves rows into the sidebar surface at the top, and
 * the header's blur lives in its `SidebarFade` layer.
 */
export function SidebarBody({ dockHeight }: { dockHeight: number }) {
  const insets = useSafeAreaInsets();
  const shell = useOptionalNavigationShell();
  const isSelecting = useSidebarSelectionSnapshot((state) => state.isSelecting);
  const { theme } = useUniwind();
  const backgroundColor = useThemeColor(theme === 'dark' ? 'sidebar' : 'background');
  const { bottomPadding: dockBottomPadding } = useDockMetrics();
  const headerInset = useSidebarHeaderTop() + appSidebar.headerRowHeight + appSidebar.headerGapY;
  const endReachedHandlerRef = useRef<(() => void) | undefined>(undefined);
  const registerEndReachedHandler = useCallback<RegisterEndReachedHandler>((handler) => {
    endReachedHandlerRef.current = handler;
  }, []);
  const handleEndReached = useCallback(() => endReachedHandlerRef.current?.(), []);
  const footerHiddenInWide = shell?.shellMode === 'wide-rail' && !isSelecting;
  const bodyBottomPadding = footerHiddenInWide
    ? insets.bottom + 12
    : dockBottomPadding + dockHeight + appSidebar.headerGapY;

  return (
    <ScrollShadow className="flex-1" color={backgroundColor} size={headerInset} visibility="top">
      <ScrollInteractionBoundary>
        {(scrollHandlers) => (
          <SidebarBranchScrollView
            {...scrollHandlers}
            topInset={headerInset}
            onEndReached={handleEndReached}
            contentContainerStyle={{
              // Clears the floating dock when visible, or keeps comfortable breathing room in wide-rail.
              paddingBottom: bodyBottomPadding,
              paddingLeft: insets.left,
              paddingTop: headerInset,
            }}
            contentInsetAdjustmentBehavior="never"
            showsVerticalScrollIndicator={false}
          >
            <SidebarBodyContent registerEndReachedHandler={registerEndReachedHandler} />
          </SidebarBranchScrollView>
        )}
      </ScrollInteractionBoundary>
    </ScrollShadow>
  );
}

function SidebarBodyContent({
  registerEndReachedHandler,
}: {
  registerEndReachedHandler: RegisterEndReachedHandler;
}) {
  const { t } = useTranslation();
  const { openScheduledTasks } = useSidebarActions('SidebarBody');
  const { source } = useChatSource();
  const destination = useSidebarDestination();
  const { progress } = useSidebarSelection();
  const disabled = useSidebarSelectionSnapshot((state) => state.isSelecting || state.isDeleting);
  const navigationStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.get() * 0.45 }));

  return (
    <>
      {source === 'remote' ? (
        <Animated.View style={navigationStyle}>
          <SidebarNavRow
            icon={ClockIcon}
            label={t('remoteTasks.title')}
            onPress={openScheduledTasks}
            testID="sidebar-scheduled-tasks"
            disabled={disabled}
            isSelected={destination === 'scheduled-tasks'}
          />
        </Animated.View>
      ) : null}

      <SidebarRecents registerEndReachedHandler={registerEndReachedHandler} />
    </>
  );
}
