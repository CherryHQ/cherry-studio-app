import { usePathname } from 'expo-router';
import { createContext, type PropsWithChildren, use, useCallback, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCanDockSidebar, useWindowFoldRegion } from '@/frontend/appShell/layout';
import { useChatSource } from '@/frontend/appShell/navigation/chat';
import {
  getNavHref,
  resolveCompactLeadingAction,
  useOptionalNavigationShell,
  useReportMiddleColumnWidth,
  WIDE_RAIL_WIDTH,
} from '@/frontend/appShell/navigationShell/state';
import { usePreference } from '@/frontend/data';
import { loggerService } from '@/shared/core/logger/LoggerService';

import {
  resolveSidebarColumn,
  resolveSidebarToggleAction,
  type SidebarColumnContent,
} from './resolveSidebarColumn';
import { SidebarToggleContext } from './toggle';

type SidebarColumnState = {
  content: SidebarColumnContent;
  setContent: (content: SidebarColumnContent) => void;
  isCollapsed: boolean;
  setCollapsed: (isCollapsed: boolean) => void;
};

const logger = loggerService.withContext('SidebarColumn');

const SidebarColumnContext = createContext<SidebarColumnState | null>(null);

/** Owns what the left column shows, for both the drawer that sizes it and the sidebar inside it. */
export function SidebarColumnProvider({ children }: PropsWithChildren) {
  const canDock = useCanDockSidebar();
  const [content, setContent] = useState<SidebarColumnContent>('sidebar');
  // Kept across launches and window changes; only a wide window reads it.
  const [isCollapsed, setCollapsedPreference] = usePreference('ui.sidebar.collapsed');
  // The column switches before the write settles; a failed write puts it back.
  const setCollapsed = useCallback(
    (next: boolean) => {
      setCollapsedPreference(next).catch((error: unknown) => {
        logger.warn('Failed to save the sidebar collapse preference', error as Error);
      });
    },
    [setCollapsedPreference],
  );
  // Search sits in the column only while there is one; a compact window searches on its own page.
  if (!canDock && content === 'search') setContent('sidebar');
  const value = useMemo(
    () => ({ content, isCollapsed, setCollapsed, setContent }),
    [content, isCollapsed, setCollapsed],
  );

  return <SidebarColumnContext value={value}>{children}</SidebarColumnContext>;
}

/** The left column for the current window, chat focus, file pane and fold. */
export function useSidebarColumn() {
  const state = use(SidebarColumnContext);
  if (!state) throw new Error('useSidebarColumn requires SidebarColumnProvider');
  const canDock = useCanDockSidebar();
  const { isChatFocused } = useChatSource();
  const pathname = usePathname();
  const shell = useOptionalNavigationShell();
  const fold = useWindowFoldRegion();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const railOffset = shell?.shellMode === 'wide-rail' ? WIDE_RAIL_WIDTH : 0;
  const isOnSettings = pathname === '/settings' || pathname.startsWith('/settings/');
  const canOpenCompactDrawer = shell
    ? (shell.activeDestination === 'chat' && shell.isAtRoot) ||
      (shell.isAtRoot &&
        resolveCompactLeadingAction(
          shell.activeDestination ? getNavHref(shell.activeDestination) : '',
          shell.pinnedTabs,
        ) === 'drawer')
    : isChatFocused;
  const adjustedFold =
    fold && railOffset > 0 ? { ...fold, x: Math.max(0, fold.x - railOffset) } : fold;
  const column = resolveSidebarColumn({
    canOpenCompactDrawer: canOpenCompactDrawer || isOnSettings || pathname === '/search',
    content: state.content,
    fold: adjustedFold,
    insetLeft: insets.left,
    insetRight: insets.right,
    isChatFocused: isChatFocused || isOnSettings,
    isCollapsed: state.isCollapsed,
    isPaneInColumn: false,
    isWide: canDock,
    windowWidth: Math.max(0, width - railOffset),
  });

  return { column, setCollapsed: state.setCollapsed, setContent: state.setContent };
}

/**
 * Shares the header's sidebar button with every page in the drawer. Rendered around the drawer,
 * where the column resolves once for all of them.
 */
export function SidebarToggleProvider({ children }: PropsWithChildren) {
  const { column, setCollapsed } = useSidebarColumn();
  const insets = useSafeAreaInsets();
  useReportMiddleColumnWidth(
    'sidebar',
    column.kind === 'permanent' ? Math.max(0, column.width - insets.left) : 0,
  );
  const action = resolveSidebarToggleAction(column);
  const value = useMemo(
    () => (action ? { action, setCollapsed } : undefined),
    [action, setCollapsed],
  );

  return <SidebarToggleContext value={value}>{children}</SidebarToggleContext>;
}
