import { createContext, type PropsWithChildren, use, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isAcross, useIsSidebarPersistent, useWindowFoldRegion } from '@/frontend/appShell/layout';
import { useChatSource } from '@/frontend/appShell/navigation/chat';
import { useFilePane } from '@/frontend/appShell/pane/state';

import { resolveSidebarColumn, type SidebarColumnContent } from './resolveSidebarColumn';

type SidebarColumnState = {
  content: SidebarColumnContent;
  setContent: (content: SidebarColumnContent) => void;
};

const SidebarColumnContext = createContext<SidebarColumnState | null>(null);

/** Owns what the left column shows, for both the drawer that sizes it and the sidebar inside it. */
export function SidebarColumnProvider({ children }: PropsWithChildren) {
  const isWide = useIsSidebarPersistent();
  const [content, setContent] = useState<SidebarColumnContent>('sidebar');
  // Search sits in the column only while there is one; a compact window searches on its own page.
  if (!isWide && content === 'search') setContent('sidebar');
  const value = useMemo(() => ({ content, setContent }), [content]);

  return <SidebarColumnContext value={value}>{children}</SidebarColumnContext>;
}

/** The left column for the current window, chat focus, file pane and fold. */
export function useSidebarColumn() {
  const state = use(SidebarColumnContext);
  if (!state) throw new Error('useSidebarColumn requires SidebarColumnProvider');
  const isWide = useIsSidebarPersistent();
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
    isPaneInColumn,
    isWide,
    windowWidth: width,
  });

  return { column, setContent: state.setContent };
}
