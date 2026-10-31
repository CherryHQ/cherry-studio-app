import { createContext, type PropsWithChildren, use, useCallback, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isAcross, useCanDockSidebar, useWindowFoldRegion } from '@/frontend/appShell/layout';
import { useChatSource } from '@/frontend/appShell/navigation/chat';
import { useFilePane } from '@/frontend/appShell/pane/state';
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
  const pane = useFilePane();
  const fold = useWindowFoldRegion();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // The pane takes the column only beside the chat; a page covering the chat brings the sidebar
  // back. A fold across the window stacks the pane above the chat instead.
  const isPaneInColumn = Boolean(
    isChatFocused && pane?.isAvailable && pane.isOpen && !(fold && isAcross(fold)),
  );
  const column = resolveSidebarColumn({
    content: state.content,
    fold,
    insetLeft: insets.left,
    insetRight: insets.right,
    isCollapsed: state.isCollapsed,
    isPaneInColumn,
    isWide: canDock,
    windowWidth: width,
  });

  return { column, setCollapsed: state.setCollapsed, setContent: state.setContent };
}

/**
 * Shares the header's sidebar button with every page in the drawer. Rendered around the drawer,
 * where the column resolves once for all of them.
 */
export function SidebarToggleProvider({ children }: PropsWithChildren) {
  const { column, setCollapsed } = useSidebarColumn();
  const action = resolveSidebarToggleAction(column);
  const value = useMemo(
    () => (action ? { action, setCollapsed } : undefined),
    [action, setCollapsed],
  );

  return <SidebarToggleContext value={value}>{children}</SidebarToggleContext>;
}
