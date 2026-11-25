import { type Href, useGlobalSearchParams, useRouter, useSegments } from 'expo-router';
import type { DrawerContentComponentProps } from 'expo-router/drawer';
import { type NavigationState, StackActions } from 'expo-router/react-navigation';
import {
  type ComponentType,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { useCanDockSidebar } from '@/frontend/appShell/layout';
import { useChatSource, useConversationTarget } from '@/frontend/appShell/navigation/chat';
import { useOptionalNavigationShellActions } from '@/frontend/appShell/navigationShell/state';
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
import { OverlaySidebarPresenceProvider } from '../hooks/useSidebarPresence';
import { useSidebarColumn } from '../SidebarColumn';
import { SidebarSelectionProvider } from '../SidebarSelectionProvider';
import { SidebarBody } from './SidebarBody';
import { SidebarFooter } from './SidebarFooter';
import { SidebarHeader } from './SidebarHeader';

type SidebarNavigation = DrawerContentComponentProps['navigation'];

type SidebarProps = {
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

/** The overlay uses the Drawer navigator for its native animation and close lifecycle. */
export function Sidebar({
  navigation,
  searchPanel,
}: SidebarProps & { navigation: SidebarNavigation }) {
  const canDock = useCanDockSidebar();
  const { cancelPending, waitForClose } = useCloseDrawerForNavigation(navigation, canDock);
  useEffect(() => {
    if (canDock) navigation.closeDrawer();
  }, [canDock, navigation]);

  if (canDock) return null;
  return (
    <OverlaySidebarPresenceProvider>
      <SidebarContent
        drawer={navigation}
        cancelPending={cancelPending}
        waitForClose={waitForClose}
        searchPanel={searchPanel}
      />
    </OverlaySidebarPresenceProvider>
  );
}

const cancelNothing = () => {};
const readyForNavigation = (signal: AbortSignal) => Promise.resolve(!signal.aborted);

/** The permanent column sits beside both stack cards, including Settings. */
export function DockedSidebar({ searchPanel }: SidebarProps) {
  const { column } = useSidebarColumn();
  const isVisible = column.kind === 'permanent';
  const { theme } = useUniwind();
  const [backgroundColor, borderColor] = useThemeColor([
    theme === 'dark' ? 'sidebar' : 'background',
    'sidebar-border',
  ]);
  return (
    <View
      className="shrink-0 overflow-hidden"
      pointerEvents={isVisible ? 'auto' : 'none'}
      style={{
        backgroundColor,
        borderEndColor: borderColor,
        borderEndWidth: isVisible ? StyleSheet.hairlineWidth : 0,
        width: isVisible ? column.width : 0,
      }}
    >
      <SidebarContent
        cancelPending={cancelNothing}
        waitForClose={readyForNavigation}
        searchPanel={searchPanel}
      />
    </View>
  );
}

function SidebarContent({
  cancelPending,
  drawer,
  searchPanel: SearchPanel,
  waitForClose,
}: SidebarProps & {
  cancelPending: () => void;
  drawer?: SidebarNavigation;
  waitForClose: SidebarActions['prepareExternalNavigation'];
}) {
  const router = useRouter();
  // Compare the exact route (including a nested page) and the context carried by its entry.
  const page =
    '/' +
    useSegments()
      .filter((segment) => !segment.startsWith('('))
      .join('/');
  const params = useGlobalSearchParams();
  const { source, remoteTarget, viewMode } = useChatSource();
  const searchRequest = useSessionSearchRequest();
  const canDock = useCanDockSidebar();
  const { column, setContent } = useSidebarColumn();
  const navigateToDestination = useOptionalNavigationShellActions()?.navigateToDestination;
  const currentConversation = useConversationTarget({ kind: 'local' });
  const { theme } = useUniwind();
  const surfaceColor = useThemeColor(theme === 'dark' ? 'sidebar' : 'background');

  const isOverlay = column.kind === 'overlay';
  const isOnSettings = page === '/settings' || page.startsWith('/settings/');
  const pageIdentity = JSON.stringify([page, Object.entries(params).sort()]);
  const settingsOrigin = useRef<{ identity: string; covered: boolean } | null>(null);
  useLayoutEffect(() => {
    if (!drawer) return;
    const origin = settingsOrigin.current;
    if (isOnSettings) {
      if (origin) origin.covered = true;
      return;
    }
    if (page === '/search') return;

    if (!isOverlay || (origin?.covered && origin.identity !== pageIdentity)) {
      drawer.closeDrawer();
    }
    if (origin?.covered) settingsOrigin.current = null;
  }, [drawer, isOnSettings, isOverlay, page, pageIdentity]);

  // A link or notification may already have navigated while the drawer was closing.
  useLayoutEffect(() => cancelPending, [cancelPending, page, params]);

  // Conversation actions assume the chat is on screen. Beside a wide window's page, return to the
  // chat first; pages above it are dismissed, as their own back steps would.
  const returnToChat = useCallback(() => {
    cancelPending();
    if (!drawer || isOnSettings) {
      if (isOnSettings) drawer?.closeDrawer();
      navigateToDestination?.('chat');
      return;
    }
    const stack = getContentStack(drawer);
    if (stack && stack.index > 0)
      drawer.dispatch({ ...StackActions.popToTop(), target: stack.key });
  }, [cancelPending, drawer, isOnSettings, navigateToDestination]);

  // From the chat a destination opens above it; from another destination it takes that one's place,
  // so moving between sidebar entries never builds a back history.
  const openScheduledTasks = useCallback(() => {
    const connectionId = remoteTarget.connectionId;
    if (!connectionId) return;
    cancelPending();
    drawer?.closeDrawer();
    const pathname = '/scheduled-tasks/[connectionId]';
    if (page === pathname && params.connectionId === connectionId) return;
    const href: Href = { pathname, params: { connectionId } };
    const stack = drawer && getContentStack(drawer);
    if (isOnSettings) router.dismissTo(href);
    else if (stack && stack.index > 0) router.replace(href);
    else router.push(href);
  }, [
    cancelPending,
    drawer,
    isOnSettings,
    page,
    params.connectionId,
    remoteTarget.connectionId,
    router,
  ]);

  const openSettings = useCallback(() => {
    cancelPending();
    if (page === '/settings') return;
    if (isOnSettings) {
      router.dismissTo('/settings');
      return;
    }
    if (drawer && isOverlay) settingsOrigin.current = { identity: pageIdentity, covered: false };
    router.push('/settings');
  }, [cancelPending, drawer, isOnSettings, isOverlay, page, pageIdentity, router]);

  const openSearchResult = useCallback(
    (result: SessionSearchResult) => {
      Keyboard.dismiss();
      drawer?.closeDrawer();
      const href = sessionSearchResultHref(result);
      if (isOnSettings) {
        router.dismissTo(href);
      } else {
        returnToChat();
        router.navigate(href);
      }
    },
    [drawer, isOnSettings, returnToChat, router],
  );
  const openSessionSearch = useSessionSearch(searchRequest, openSearchResult);

  const actions = useMemo<SidebarActions>(
    () => ({
      closeDrawer: () => {
        drawer?.closeDrawer();
        returnToChat();
      },
      prepareExternalNavigation: waitForClose,
      returnToChat,
      openSearch:
        source === 'local'
          ? () => {
              cancelPending();
              // A wide window searches in the column, beside the chat its results open.
              if (canDock && SearchPanel) {
                drawer?.closeDrawer();
                setContent('search');
              } else openSessionSearch();
            }
          : undefined,
      openScheduledTasks,
      openSettings,
    }),
    [
      cancelPending,
      canDock,
      drawer,
      openScheduledTasks,
      openSessionSearch,
      openSettings,
      returnToChat,
      SearchPanel,
      setContent,
      source,
      waitForClose,
    ],
  );

  const closeSearch = useCallback(() => setContent('sidebar'), [setContent]);
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
