import { type Href, useGlobalSearchParams, useRouter, useSegments } from 'expo-router';
import type { DrawerContentComponentProps } from 'expo-router/drawer';
import { type NavigationState, StackActions } from 'expo-router/react-navigation';
import { type ComponentType, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { Keyboard, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { useCanDockSidebar } from '@/frontend/appShell/layout';
import { useChatSource, useConversationTarget } from '@/frontend/appShell/navigation/chat';
import type { AppSearchPanelProps } from '@/frontend/appShell/search';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { type SidebarActions, SidebarActionsContext } from '../context';
import type { SessionSearchResult } from '../hooks/sessionSearch';
import { useCloseDrawerForNavigation } from '../hooks/useCloseDrawerForNavigation';
import {
  sessionSearchResultHref,
  useSessionSearch,
  useSessionSearchRequest,
} from '../hooks/useSessionSearch';
import { useSidebarColumn } from '../SidebarColumn';
import { SidebarSelectionProvider } from '../SidebarSelectionProvider';
import { SidebarBody } from './SidebarBody';
import { SidebarFooter } from './SidebarFooter';
import { SidebarHeader } from './SidebarHeader';

type SidebarNavigation = DrawerContentComponentProps['navigation'];

type SidebarProps = {
  navigation: SidebarNavigation;
  /** Renders conversation search in the column of a wide window; supplied by the route layer. */
  searchPanel?: ComponentType<AppSearchPanelProps<SessionSearchResult>>;
};

/**
 * The stack of pages beside the sidebar: the chat at its root and destinations above it. A wide
 * window can reach the sidebar from any of them, so actions read it when they run.
 */
function getContentStack(navigation: SidebarNavigation) {
  const route = navigation.getState().routes.find((candidate) => candidate.name === '(main)');
  return route?.state as NavigationState | undefined;
}

/** Sidebar whose root owns the drawer-scoped actions, whether it overlays the chat or sits beside it. */
export function Sidebar({ navigation, searchPanel: SearchPanel }: SidebarProps) {
  const router = useRouter();
  // Compare the exact route (including a nested page) and the context carried by its entry.
  const page =
    '/' +
    useSegments()
      .filter((segment) => !segment.startsWith('('))
      .join('/');
  const params = useGlobalSearchParams();
  const { source, remoteTarget, viewMode } = useChatSource();
  const openSessionSearch = useSessionSearch();
  const searchRequest = useSessionSearchRequest();
  const canDock = useCanDockSidebar();
  const { column, setContent } = useSidebarColumn();
  const { cancelPending, waitForClose } = useCloseDrawerForNavigation(navigation, canDock);
  const currentConversation = useConversationTarget({ kind: 'local' });
  const { theme } = useUniwind();
  const surfaceColor = useThemeColor(theme === 'dark' ? 'sidebar' : 'background');

  // Clear any overlay left open by a window change or a link that navigated away from the chat.
  const isOverlay = column.kind === 'overlay';
  useEffect(() => {
    if (!isOverlay) navigation.closeDrawer();
  }, [isOverlay, navigation]);

  // A link or notification may already have navigated while the drawer was closing.
  useLayoutEffect(() => cancelPending, [cancelPending, page, params]);

  // Conversation actions assume the chat is on screen. Beside a wide window's page, return to the
  // chat first; pages above it are dismissed, as their own back steps would.
  const returnToChat = useCallback(() => {
    cancelPending();
    const stack = getContentStack(navigation);
    if (stack && stack.index > 0)
      navigation.dispatch({ ...StackActions.popToTop(), target: stack.key });
  }, [cancelPending, navigation]);

  // From the chat a destination opens above it; from another destination it takes that one's place,
  // so moving between sidebar entries never builds a back history.
  const openDestination = useCallback(
    (href: Href) => {
      cancelPending();
      if (isOverlay) navigation.closeDrawer();
      const pathname = typeof href === 'string' ? href : href.pathname;
      if (
        page === pathname &&
        (typeof href === 'string' ||
          Object.entries(href.params ?? {}).every(([key, value]) => params[key] === value))
      )
        return;
      const stack = getContentStack(navigation);
      if (stack && stack.index > 0) router.replace(href);
      else router.push(href);
    },
    [cancelPending, isOverlay, navigation, page, params, router],
  );

  const actions = useMemo<SidebarActions>(
    () => ({
      closeDrawer: () => {
        navigation.closeDrawer();
        returnToChat();
      },
      prepareExternalNavigation: waitForClose,
      returnToChat,
      openSearch:
        source === 'local'
          ? () => {
              cancelPending();
              navigation.closeDrawer();
              // A wide window searches in the column, beside the chat its results open.
              if (canDock && SearchPanel) setContent('search');
              else openSessionSearch();
            }
          : undefined,
      openScheduledTasks: () => {
        if (remoteTarget.connectionId)
          openDestination({
            pathname: '/scheduled-tasks/[connectionId]',
            params: { connectionId: remoteTarget.connectionId },
          });
      },
      openSettings: () => openDestination('/settings'),
    }),
    [
      navigation,
      cancelPending,
      waitForClose,
      canDock,
      openDestination,
      openSessionSearch,
      returnToChat,
      SearchPanel,
      setContent,
      source,
      remoteTarget.connectionId,
    ],
  );

  const closeSearch = useCallback(() => setContent('sidebar'), [setContent]);
  const openSearchResult = useCallback(
    (result: SessionSearchResult) => {
      // The chat it opens is what the user reads next; the keyboard would cover its composer.
      Keyboard.dismiss();
      returnToChat();
      router.navigate(sessionSearchResultHref(result));
    },
    [returnToChat, router],
  );
  // The conversation target exists only while the chat itself is on screen.
  const isOpenResult = useCallback(
    (result: SessionSearchResult) =>
      result.kind === 'session' && result.item.id === currentConversation.sessionId,
    [currentConversation.sessionId],
  );
  const foldGap = column.kind === 'permanent' ? column.foldGap : 0;
  const isColumnHidden = !isOverlay && column.kind !== 'permanent';
  const isSearching = Boolean(
    SearchPanel && column.kind === 'permanent' && column.content === 'search',
  );

  return (
    <SidebarActionsContext value={actions}>
      <SidebarSelectionProvider scope={`${source}:${remoteTarget.connectionId ?? ''}:${viewMode}`}>
        {/* A fold at the column's trailing edge stays empty. */}
        <View
          accessibilityElementsHidden={isColumnHidden}
          className="flex-1"
          importantForAccessibility={isColumnHidden ? 'no-hide-descendants' : 'auto'}
          style={{ marginEnd: foldGap }}
          testID="sidebar"
        >
          {/* Search covers the sidebar instead of replacing it, so its list keeps its place. */}
          <View
            accessibilityElementsHidden={isSearching}
            className="flex-1"
            importantForAccessibility={isSearching ? 'no-hide-descendants' : 'auto'}
          >
            <SidebarBody />
            <SidebarHeader />
            <SidebarFooter />
          </View>
          {isSearching && SearchPanel ? (
            <View className="absolute inset-0" style={{ backgroundColor: surfaceColor }}>
              <SearchPanel
                isSelected={isOpenResult}
                onClose={closeSearch}
                onSelect={openSearchResult}
                request={searchRequest}
              />
            </View>
          ) : null}
        </View>
      </SidebarSelectionProvider>
    </SidebarActionsContext>
  );
}
