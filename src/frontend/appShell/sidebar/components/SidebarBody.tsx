import BoxesIcon from '@cherrystudio/app-icons/icons/boxes';
import ClockIcon from '@cherrystudio/app-icons/icons/clock';
import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import MousePointerClickIcon from '@cherrystudio/app-icons/icons/mouse-pointer-click';
import PaletteIcon from '@cherrystudio/app-icons/icons/palette';
import ToolCaseIcon from '@cherrystudio/app-icons/icons/tool-case';
import { ScrollInteractionBoundary, ScrollShadow } from '@cherrystudio/ui/components';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

import { useChatSource } from '@/frontend/appShell/navigation/chat';
import { useFilePane } from '@/frontend/appShell/pane/state';
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
export function SidebarBody() {
  const insets = useSafeAreaInsets();
  const { theme } = useUniwind();
  const backgroundColor = useThemeColor(theme === 'dark' ? 'sidebar' : 'background');
  const { bottomPadding: dockBottomPadding } = useDockMetrics();
  const headerInset = useSidebarHeaderTop() + appSidebar.headerRowHeight + appSidebar.headerGapY;
  const endReachedHandlerRef = useRef<(() => void) | undefined>(undefined);
  const registerEndReachedHandler = useCallback<RegisterEndReachedHandler>((handler) => {
    endReachedHandlerRef.current = handler;
  }, []);
  const handleEndReached = useCallback(() => endReachedHandlerRef.current?.(), []);

  return (
    <ScrollShadow className="flex-1" color={backgroundColor} size={headerInset} visibility="top">
      <ScrollInteractionBoundary>
        {(scrollHandlers) => (
          <SidebarBranchScrollView
            {...scrollHandlers}
            topInset={headerInset}
            onEndReached={handleEndReached}
            contentContainerStyle={{
              // Clears the floating dock at its shared composer-aligned position.
              paddingBottom: dockBottomPadding + appSidebar.dockHeight + appSidebar.headerGapY,
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
  const {
    navigateAgents,
    openLibrary,
    openPaintings,
    openPlugins,
    openSkills,
    openScheduledTasks,
  } = useSidebarActions('SidebarBody');
  const { isChatFocused, source } = useChatSource();
  const pane = useFilePane();
  const destination = useSidebarDestination();
  const { progress } = useSidebarSelection();
  const disabled = useSidebarSelectionSnapshot((state) => state.isSelecting || state.isDeleting);
  const navigationStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.get() * 0.45 }));

  return (
    <>
      {/* No home row: that surface moves under settings. These destinations only manage this phone. */}
      {source === 'local' ? (
        <Animated.View style={navigationStyle}>
          <SidebarNavRow
            icon={MousePointerClickIcon}
            label={t('navigation.agents')}
            onPress={navigateAgents}
            testID="sidebar-agents"
            disabled={disabled}
            isSelected={destination === 'agents'}
          />
          <SidebarNavRow
            icon={PaletteIcon}
            label={t('navigation.paintings')}
            onPress={openPaintings}
            testID="sidebar-paintings"
            disabled={disabled}
            isSelected={destination === 'paintings'}
          />
          <SidebarNavRow
            icon={BoxesIcon}
            label={t('plugins.title')}
            onPress={openPlugins}
            testID="sidebar-plugins"
            disabled={disabled}
            isSelected={destination === 'plugins'}
          />
          <SidebarNavRow
            icon={ToolCaseIcon}
            label={t('skills.title')}
            onPress={openSkills}
            testID="sidebar-skills"
            disabled={disabled}
            isSelected={destination === 'skills'}
          />
          <SidebarNavRow
            icon={FolderIcon}
            label={t('navigation.library')}
            onPress={openLibrary}
            testID="sidebar-library"
            disabled={disabled}
            isSelected={
              destination === 'library' ||
              Boolean(isChatFocused && pane?.isAvailable && pane.isOpen)
            }
          />
        </Animated.View>
      ) : null}

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
